import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL="https://dtgwxfibkurjbgutlcxw.supabase.co";
const SUPABASE_KEY="sb_publishable_y6lWbqtfNnuiDijfWxeCTw_eyAcPwZG";
const sb=createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let room=new URLSearchParams(location.search).get("room"), tournament=null, teams=[], players=[], me="", role="spectator", admin=false, channel=null;

function err(e){
 console.error(e);
 const msg=e?.message||e?.error_description||e?.details||String(e);
 $("error").textContent=msg;
 $("error").classList.remove("hidden");
}
function hideErr(){$("error").classList.add("hidden")}
function turnTeam(){
 const picked=players.filter(p=>p.picked_by_team).length;
 return teams.length?teams[picked%teams.length]:null;
}
function myCaptainTeam(){
 return teams.find(t=>t.captain.trim().toLowerCase()===me.trim().toLowerCase())||null;
}
function isAdminCaptain(){
 return !!teams.length && teams[0].captain.trim().toLowerCase()===me.trim().toLowerCase();
}
function capacities(){
 const n=players.length, k=teams.length;
 return teams.map((_,i)=>Math.floor(n/k)+(i<n%k?1:0));
}
async function load(){
 const {data:t,error:e}=await sb.from("tournaments").select("*").eq("room_code",room).single();
 if(e)throw e;tournament=t;
 const [a,b]=await Promise.all([
  sb.from("teams").select("*").eq("tournament_id",t.id).order("draft_order"),
  sb.from("players").select("*").eq("tournament_id",t.id).order("created_at")
 ]);
 if(a.error)throw a.error;if(b.error)throw b.error;
 teams=a.data;players=b.data;render();
}
async function subscribe(){
 if(channel)await sb.removeChannel(channel);
 channel=sb.channel("tournament:"+tournament.id)
 .on("postgres_changes",{event:"*",schema:"public",table:"tournaments",filter:`id=eq.${tournament.id}`},load)
 .on("postgres_changes",{event:"*",schema:"public",table:"teams",filter:`tournament_id=eq.${tournament.id}`},load)
 .on("postgres_changes",{event:"*",schema:"public",table:"players",filter:`tournament_id=eq.${tournament.id}`},load)
 .on("postgres_changes",{event:"*",schema:"public",table:"draft_picks",filter:`tournament_id=eq.${tournament.id}`},load);
 await new Promise((resolve,reject)=>{
   let done=false;
   channel.subscribe(status=>{
     if(status==="SUBSCRIBED"&&!done){done=true;resolve();}
     else if(["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(status)&&!done){
       done=true;reject(new Error("Supabase Realtime subscription failed: "+status));
     }
   });
   setTimeout(()=>{if(!done){done=true;reject(new Error("Supabase Realtime subscription timed out after 10 seconds."));}},10000);
 });
 $("connection").textContent="● Live";
}
async function create(){
 try{
  hideErr();
  const n=Math.max(2,Math.min(16,+$("teamCount").value||2));
  const rows=$("teamsInput").value.split(/\n/).map(x=>x.trim()).filter(Boolean);
  const names=[...new Set($("playersInput").value.split(/\n|,/).map(x=>x.trim()).filter(Boolean))];
  if(rows.length!==n)throw new Error(`Enter exactly ${n} teams.`);
  if(names.length<n)throw new Error("Add at least one player per team.");
  const tr=rows.map((r,i)=>{const [name,captain]=r.split("|");return{name:(name||`Team ${i+1}`).trim(),captain:(captain||`Captain ${i+1}`).trim(),draft_order:i}});
  room=crypto.randomUUID().replaceAll("-","").slice(0,10).toUpperCase();
  const {data:t,error:te}=await sb.from("tournaments").insert({room_code:room,name:$("tournamentName").value.trim()||"Turf Tournament"}).select().single();
  if(te)throw te;tournament=t;admin=true;me=tr[0].captain;role="captain";
  const {data:td,error:tee}=await sb.from("teams").insert(tr.map(x=>({...x,tournament_id:t.id}))).select();
  if(tee)throw tee;
  const {error:pe}=await sb.from("players").insert(names.map(name=>({tournament_id:t.id,name})));
  if(pe)throw pe;
  history.replaceState(null,"",`?room=${room}`);
  localStorage.setItem("turfdraft:"+room,JSON.stringify({me,role,admin:true}));
  await load();await subscribe();showDraft();
 }catch(e){err(e)}
}
async function join(){
 try{
  hideErr();
  me=$("joinName").value.trim();
  if(!me)throw new Error("Enter your name.");
  await load();
  role=myCaptainTeam()?"captain":"spectator";
  localStorage.setItem("turfdraft:"+room,JSON.stringify({me,role}));
  showDraft();
  try{
   await subscribe();
  }catch(realtimeError){
   console.error("Realtime connection:",realtimeError);
   $("connection").textContent="● Realtime offline";
   $("error").textContent="Tournament loaded. Live updates are currently unavailable: "+(realtimeError?.message||String(realtimeError));
   $("error").classList.remove("hidden");
  }
 }catch(e){
  console.error("Join/load error:",e);
  $("joinInfo").textContent="Could not load this tournament.";
  $("error").textContent=e?.message||e?.error_description||e?.details||String(e);
  $("error").classList.remove("hidden");
 }
}
async function pick(playerId){
 try{
  await load();
  const t=turnTeam();
  const myTeam=myCaptainTeam();
  if(!t)throw new Error("No team is available to pick.");
  if(!myTeam)throw new Error("You are not a registered captain for this tournament.");
  if(t.id!==myTeam.id)throw new Error(`It is ${t.captain}'s turn. Please wait for the other captain.`);
  if(tournament.status==="complete")return;
  const picked=players.filter(p=>p.picked_by_team).length;
  const cap=capacities()[t.draft_order];
  if(players.filter(p=>p.picked_by_team===t.id).length>=cap)throw new Error("Your team has reached its player limit.");
  const target=players.find(p=>p.id===playerId && !p.picked_by_team);
  if(!target)throw new Error("That player has already been selected.");
  const {error:e}=await sb.from("draft_picks").insert({
    tournament_id:tournament.id,player_id:target.id,team_id:t.id,pick_number:picked
  });
  if(e)throw e;
  const {data:updated,error:u}=await sb.from("players")
    .update({picked_by_team:t.id,pick_number:picked})
    .eq("id",target.id).is("picked_by_team",null).select().single();
  if(u)throw u;
  if(!updated)throw new Error("This player was just selected by another captain. Please refresh.");
  if(picked+1===players.length)
    await sb.from("tournaments").update({status:"complete"}).eq("id",tournament.id);
  await load();
 }catch(e){err(e)}
}
async function undo(){
 try{
  await load();
  if(!isAdminCaptain())throw new Error("Only the tournament creator captain can undo.");
  const {data:picks,error:e}=await sb.from("draft_picks").select("*")
    .eq("tournament_id",tournament.id).order("pick_number",{ascending:false}).limit(1);
  if(e)throw e;
  if(!picks.length)return;
  const p=picks[0];
  const {error:pe}=await sb.from("players").update({picked_by_team:null,pick_number:null})
    .eq("id",p.player_id);
  if(pe)throw pe;
  const {error:de}=await sb.from("draft_picks").delete().eq("id",p.id);
  if(de)throw de;
  const {error:te}=await sb.from("tournaments").update({status:"drafting"}).eq("id",tournament.id);
  if(te)throw te;
  await load();
 }catch(e){err(e)}
}
async function reset(){
 try{
  await load();
  if(!isAdminCaptain())throw new Error("Only the tournament creator captain can reset.");
  if(!confirm("Reset all picks?"))return;
  const {error:p}=await sb.from("players").update({picked_by_team:null,pick_number:null})
    .eq("tournament_id",tournament.id);
  if(p)throw p;
  const {error:d}=await sb.from("draft_picks").delete().eq("tournament_id",tournament.id);
  if(d)throw d;
  const {error:t}=await sb.from("tournaments").update({status:"drafting"}).eq("id",tournament.id);
  if(t)throw t;
  await load();
 }catch(e){err(e)}
}
function render(){
 $("title").textContent="🏆 "+tournament.name;
 $("meta").textContent=`Room ${room} • ${players.length} players • ${teams.length} teams`;
 const picked=players.filter(p=>p.picked_by_team).length;
 const t=turnTeam();
 $("status").textContent=tournament.status==="complete"?"🎉 Draft complete":`🎯 ${t?.captain} — ${t?.name} picks now`;
 $("left").textContent=`(${players.length-picked} left)`;
 const myTeam=myCaptainTeam();
 const can=!!t&&!!myTeam&&t.id===myTeam.id&&tournament.status!=="complete";
 $("available").innerHTML=players.filter(p=>!p.picked_by_team).map(p=>`<div class="player"><span>${esc(p.name)}</span><button class="pick" ${can?"":"disabled"} data-id="${p.id}">Pick</button></div>`).join("")||"<span class='muted'>No players left.</span>";
 document.querySelectorAll(".pick").forEach(b=>b.onclick=()=>pick(b.dataset.id));
 $("teamsView").innerHTML=teams.map(t=>`<div class="team ${t.id===turnTeam()?.id?"active":""}"><h2>${esc(t.name)}</h2><div class="muted">Captain: ${esc(t.captain)}</div>${players.filter(p=>p.picked_by_team===t.id).sort((a,b)=>a.pick_number-b.pick_number).map(p=>`<div class="player">${esc(p.name)}</div>`).join("")}</div>`).join("");
 const admin=isAdminCaptain();
 $("undo").disabled=!admin||picked===0;
 $("reset").disabled=!admin||picked===0;
 $("undo").style.opacity=admin&&picked?"1":"0.5";
 $("reset").style.opacity=admin&&picked?"1":"0.5";
}
function showDraft(){$("setup").classList.add("hidden");$("join").classList.add("hidden");$("draft").classList.remove("hidden");render()}
$("create").onclick=create;$("joinBtn").onclick=join;$("copy").onclick=()=>navigator.clipboard.writeText(location.href);$("undo").onclick=undo;$("reset").onclick=reset;

(async()=>{
 if(room){
  $("setup").classList.add("hidden");
  $("join").classList.remove("hidden");
  const s=JSON.parse(localStorage.getItem("turfdraft:"+room)||"null");
  if(s)$("joinName").value=s.me||"";
  try{
   await load();
   $("joinInfo").textContent=`${tournament.name} • ${teams.length} teams • ${players.length} players • Room ${room}`;
   $("joinRole").innerHTML='<option value="spectator">Player / Spectator</option>'+
     teams.map(t=>`<option value="captain">${esc(t.captain)} — ${esc(t.name)}</option>`).join("");
   $("joinRole").value=teams.some(t=>t.captain.trim().toLowerCase()===($("joinName").value||"").trim().toLowerCase())?"captain":(s?.role||"spectator");
  }catch(e){
   console.error("Room load error:",e);
   $("joinInfo").textContent="This room could not be loaded.";
   $("error").textContent=e?.message||e?.error_description||e?.details||String(e);
   $("error").classList.remove("hidden");
  }
 }
})();

