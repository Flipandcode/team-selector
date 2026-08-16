import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const URL="https://dtgwxfibkurjbgutlcxw.supabase.co", KEY="sb_publishable_y6lWbqtfNnuiDijfWxeCTw_eyAcPwZG";
const sb=createClient(URL,KEY); const $=id=>document.getElementById(id); let tournament=null,teams=[],players=[],matches=[],bat=[],bowl=[],balls=[],me="",room="",channel=null,tab="overview",selectedMatchId=null,innings=1,isAdmin=false,authUser=null,draftPlayers=[],draftTeams=[];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function showError(e){console.error(e);$("error").textContent=e?.message||String(e);$("error").classList.remove("hidden")}
function hideError(){$("error").classList.add("hidden")}
function show(id){["login","home","create","join","room"].forEach(x=>$(x).classList.toggle("hidden",x!==id)); updateAdminUI()}
function team(id){return teams.find(t=>t.id===id)}
function captainFor(id){return team(id)?.captain||""}
function myTeam(){return teams.find(t=>t.captain.toLowerCase()===me.toLowerCase())}


async function refreshAuth(){
 const {data}=await sb.auth.getSession();
 authUser=data.session?.user||null;
 if(!authUser){isAdmin=false;updateAdminUI();return}
 const {data:admin}=await sb.from("admin_users").select("auth_user_id").eq("auth_user_id",authUser.id).eq("active",true).maybeSingle();
 isAdmin=!!admin;updateAdminUI();
}
function updateAdminUI(){
 const logged=!!authUser&&isAdmin;
 $("newBtn")?.classList.toggle("hidden",!logged);
 $("logoutBtn")?.classList.toggle("hidden",!logged);
 $("homeLoginBtn")?.classList.toggle("hidden",logged);
 $("adminLoginNav")?.classList.toggle("hidden",logged);
 $("adminStatus") && ($("adminStatus").textContent=logged?`Signed in as ${authUser.email}`:"");
}
async function adminLogin(){
 try{
  hideError();
  const email=$("adminUser").value.trim(),password=$("adminPass").value;
  if(!email||!password)throw new Error("Enter your admin email and password.");
  const btn=$("loginBtn"); if(btn){btn.disabled=true;btn.textContent="Signing in…";}
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error)throw error;
  authUser=data.user;
  await refreshAuth();
  if(!isAdmin){
    await sb.auth.signOut();
    authUser=null;
    await refreshAuth();
    throw new Error("This Supabase account is not registered as a MatchDay admin.");
  }
  show("home");
  await loadTournaments();
 }catch(e){
  showError(e);
 }finally{
  const btn=$("loginBtn"); if(btn){btn.disabled=false;btn.textContent="Admin Login";}
 }
}
async function adminLogout(){
 await sb.auth.signOut();authUser=null;isAdmin=false;updateAdminUI();show("home");
}
function openAdminLogin(){
 hideError();
 show("login");
 $("adminUser")?.focus();
}
async function loadTournaments(){
 const {data,error}=await sb.from("tournaments").select("*").order("created_at",{ascending:false}); if(error)throw error;
 $("tournamentList").innerHTML=data.length?data.map(t=>`<div class="row"><div><b>${esc(t.name)}</b><div class="muted small">${esc(t.room_code)} • ${t.match_count||1} matches • ${t.status}</div></div><button class="secondary joinRoom" data-room="${esc(t.room_code)}">Join</button></div>`).join(""):'<div class="empty">No tournaments yet. Create your first series.</div>';
 document.querySelectorAll(".joinRoom").forEach(b=>b.onclick=()=>openJoin(b.dataset.room));
}

function renderCreateForm(){
 const count=Math.max(2,Math.min(20,Number($("teamCount").value)||2));
 while(draftTeams.length<count)draftTeams.push({name:`Team ${draftTeams.length+1}`,captain:""});
 if(draftTeams.length>count)draftTeams=draftTeams.slice(0,count);
 $("teamFields").innerHTML=draftTeams.map((t,i)=>`<div class="card" style="margin:8px 0"><div class="grid">
  <div class="field"><label>Team ${i+1} name</label><input class="team-name" data-i="${i}" value="${esc(t.name)}" placeholder="Team name"></div>
  <div class="field"><label>Team ${i+1} captain</label><select class="team-captain" data-i="${i}" ${draftPlayers.length?"":"disabled"}><option value="">${draftPlayers.length?"Select captain from player list":"Add players first"}</option>${draftPlayers.map(p=>`<option value="${esc(p)}" ${p===t.captain?"selected":""}>${esc(p)}</option>`).join("")}</select></div>
 </div></div>`).join("");
 document.querySelectorAll(".team-name").forEach(x=>x.oninput=()=>{draftTeams[+x.dataset.i].name=x.value});
 document.querySelectorAll(".team-captain").forEach(x=>x.onchange=()=>{draftTeams[+x.dataset.i].captain=x.value});
 $("playerChips").innerHTML=draftPlayers.length?draftPlayers.map((p,i)=>`<span class="pill" style="margin:4px;display:inline-flex;gap:7px;align-items:center">${esc(p)} <button type="button" class="remove-player" data-i="${i}" style="padding:2px 6px;border-radius:8px;background:#3a2130;color:#fff">×</button></span>`).join(""):'<span class="muted">No players added yet.</span>';
 document.querySelectorAll(".remove-player").forEach(x=>x.onclick=()=>{draftPlayers.splice(+x.dataset.i,1);draftTeams.forEach(t=>{if(!draftPlayers.includes(t.captain))t.captain=""});renderCreateForm()});
}
function addDraftPlayer(){
 const v=$("playerAddInput").value.trim();
 if(!v)return;
 if(draftPlayers.some(p=>p.toLowerCase()===v.toLowerCase())){showError(new Error("That player is already added."));return}
 draftPlayers.push(v);$("playerAddInput").value="";hideError();renderCreateForm();
}

async function createTournament(){
 try{hideError();await refreshAuth();if(!isAdmin)throw new Error("Admin login required.");const name=$("tName").value.trim()||"Cricket Series", n=+$("teamCount").value||2, mc=+$("matchCount").value||1;
 const tr=draftTeams.slice(0,n).map((x,i)=>({name:x.name.trim()||`Team ${i+1}`,captain:x.captain.trim(),draft_order:i}));
 const pn=[...new Set(draftPlayers.map(x=>x.trim()).filter(Boolean))];
 if(tr.length!==n)throw new Error(`Enter exactly ${n} teams.`);
 if(pn.length<2)throw new Error("Add at least 2 players.");
 if(tr.some(x=>!x.name))throw new Error("Enter a name for every team.");
 if(tr.some(x=>!x.captain))throw new Error("Select a captain for every team.");
 if(tr.some(x=>!pn.some(p=>p.toLowerCase()===x.captain.toLowerCase())))throw new Error("Every captain must be selected from the player list.");
 if(new Set(tr.map(x=>x.captain.toLowerCase())).size!==tr.length)throw new Error("Each team must have a different captain.");
 room=crypto.randomUUID().replaceAll("-","").slice(0,10).toUpperCase();
 const {data:t,error:te}=await sb.from("tournaments").insert({name,room_code:room,match_count:mc,status:"drafting"}).select().single();if(te)throw te;tournament=t;
 const {data:td,error:tee}=await sb.from("teams").insert(tr.map(x=>({...x,tournament_id:t.id}))).select();if(tee)throw tee;teams=td;
 const {data:pd,error:pe}=await sb.from("players").insert(pn.map(name=>({tournament_id:t.id,name,joined:false}))).select();if(pe)throw pe;players=pd;
 await buildFixtures(); history.replaceState(null,"",`?room=${room}`); me=tr[0].captain; localStorage.setItem("md:"+room,me); await loadRoom();show("room");
 }catch(e){showError(e)}
}
async function buildFixtures(){
 const {data:existing}=await sb.from("matches").select("id").eq("tournament_id",tournament.id).limit(1);if(existing?.length)return;
 const count=tournament.match_count||1, rows=[];let m=1;
 if(teams.length===2){for(let i=0;i<count;i++){rows.push({tournament_id:tournament.id,match_number:m++,team_a_id:teams[i%2].id,team_b_id:teams[(i+1)%2].id});}}
 else {for(let i=0;i<teams.length&&rows.length<count;i++)for(let j=i+1;j<teams.length&&rows.length<count;j++)rows.push({tournament_id:tournament.id,match_number:m++,team_a_id:teams[i].id,team_b_id:teams[j].id});}
 const {error}=await sb.from("matches").insert(rows);if(error)throw error;
}
async function loadRoom(){
 const {data:t,error:te}=await sb.from("tournaments").select("*").eq("room_code",room).single();if(te)throw te;tournament=t;
 const [a,b,c,d,e]=await Promise.all([
 sb.from("teams").select("*").eq("tournament_id",t.id).order("draft_order"),
 sb.from("players").select("*").eq("tournament_id",t.id).order("created_at"),
 sb.from("matches").select("*").eq("tournament_id",t.id).order("match_number"),
 sb.from("batting_records").select("*"),
 sb.from("ball_events").select("*").order("ball_number")
 ]);
 if(a.error)throw a.error;if(b.error)throw b.error;if(c.error)throw c.error;if(d.error)throw d.error;if(e.error)throw e.error;
 teams=a.data;players=b.data;matches=c.data;bat=d.data||[];balls=e.data||[];
 const {data:bo,error:be}=await sb.from("bowling_records").select("*");if(be)throw be;bowl=bo||[];
 render();
}
async function openJoin(code){
 try{hideError();room=code;history.replaceState(null,"",`?room=${room}`);await loadRoom();$("joinTitle").textContent=`Join ${tournament.name}`;$("joinMeta").textContent=`${teams.length} teams • ${players.length} players • ${matches.length} matches`;
 const captainPlayers=players.filter(p=>teams.some(t=>t.captain.toLowerCase()===p.name.toLowerCase()));
 const regularPlayers=players.filter(p=>!teams.some(t=>t.captain.toLowerCase()===p.name.toLowerCase()));
 $("joinName").innerHTML='<option value="">Select your name</option><optgroup label="👑 Captains">'+captainPlayers.map(p=>`<option value="${esc(p.name)}">${esc(p.name)} — Captain • ${esc(teams.find(t=>t.captain.toLowerCase()===p.name.toLowerCase())?.name||"")}${p.joined?" — Joined":""}</option>`).join("")+'</optgroup><optgroup label="Players">'+regularPlayers.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}${p.joined?" — Joined":""}</option>`).join("")+'</optgroup>';
 $("captainHint").textContent=captainPlayers.length?`👑 Captains: ${captainPlayers.map(p=>p.name).join(", ")}`:"No captains configured.";
 show("join");
 }catch(e){showError(e)}
}
async function join(){
 try{hideError();me=$("joinName").value;if(!me)throw new Error("Select your name from the tournament player list.");
 const p=players.find(x=>x.name===me);if(!p)throw new Error("Select a listed player.");
 if(p.joined&&!localStorage.getItem("mdjoined:"+room+":"+me.toLowerCase()))throw new Error(`${me} has already joined this tournament.`);
 if(!p.joined){const {data,error}=await sb.from("players").update({joined:true,joined_at:new Date().toISOString()}).eq("id",p.id).eq("joined",false).select().single();if(error)throw error;if(!data)throw new Error(`${me} has already joined.`);}
 localStorage.setItem("mdjoined:"+room+":"+me.toLowerCase(),"1");localStorage.setItem("md:"+room,me);await loadRoom();show("room");subscribe();
 }catch(e){showError(e)}
}
async function start(){
 try{if(tournament.status==="drafting"){const {error}=await sb.from("tournaments").update({status:"live",started_at:new Date().toISOString()}).eq("id",tournament.id);if(error)throw error;await loadRoom()}}catch(e){showError(e)}
}
async function saveScore(){
 try{
  const id=$("matchSelect").value,m=matches.find(x=>x.id===id);if(!m)throw new Error("Select a match.");
  const vals={status:$("matchStatus").value,score_a_runs:+$("aRuns").value||0,score_a_wickets:+$("aWkts").value||0,score_a_overs:+$("aOvers").value||0,score_b_runs:+$("bRuns").value||0,score_b_wickets:+$("bWkts").value||0,score_b_overs:+$("bOvers").value||0,winner_team_id:$("winner").value||null};
  if(vals.status==="completed"&&!vals.winner_team_id)throw new Error("Select the winner.");
  const {error}=await sb.from("matches").update(vals).eq("id",id);if(error)throw error;
  await savePlayerStats(id);await loadRoom();
 }catch(e){showError(e)}
}
async function savePlayerStats(matchId){
 const m=matches.find(x=>x.id===matchId);
 const bRows=players.filter(p=>p.joined).map(p=>({match_id:matchId,player_id:p.id,team_id:teams.find(t=>t.id===m.team_a_id||t.id===m.team_b_id)?.id,innings:1,runs:+($(`r_${p.id}`)?.value||0),balls:+($(`bl_${p.id}`)?.value||0),fours:+($(`f_${p.id}`)?.value||0),sixes:+($(`s_${p.id}`)?.value||0),dismissal:$(`d_${p.id}`)?.value||null})).filter(x=>x.team_id);
 for(const r of bRows){const {error}=await sb.from("batting_records").upsert(r,{onConflict:"match_id,player_id,innings"});if(error)throw error}
 const bowlRows=players.filter(p=>p.joined).map(p=>({match_id:matchId,player_id:p.id,team_id:teams.find(t=>t.id===m.team_a_id||t.id===m.team_b_id)?.id,innings:1,overs:+($(`o_${p.id}`)?.value||0),maidens:+($(`md_${p.id}`)?.value||0),runs:+($(`br_${p.id}`)?.value||0),wickets:+($(`w_${p.id}`)?.value||0)})).filter(x=>x.team_id&&x.overs);
 for(const r of bowlRows){const {error}=await sb.from("bowling_records").upsert(r,{onConflict:"match_id,player_id,innings"});if(error)throw error}
}

function currentBallRows(mid,inn=1){return balls.filter(x=>x.match_id===mid&&x.innings===inn).sort((a,b)=>a.ball_number-b.ball_number)}
function ballState(mid,inn=1){
 const rows=currentBallRows(mid,inn);let runs=0,wkts=0,legal=0;
 rows.forEach(x=>{runs+=x.total_runs||0;if(x.event_type==="wicket")wkts++;if(!["wide","noball"].includes(x.event_type))legal++});
 return {runs,wkts,legal,overs:`${Math.floor(legal/6)}.${legal%6}`}
}
function ballButtons(){return `<div class="actions">
<button class="secondary ball" data-event="dot">Dot</button><button class="secondary ball" data-event="run" data-runs="1">1</button><button class="secondary ball" data-event="run" data-runs="2">2</button><button class="secondary ball" data-event="run" data-runs="3">3</button><button class="primary ball" data-event="four">4</button><button class="gold ball" data-event="six">6</button><button class="secondary ball" data-event="wide">Wide</button><button class="secondary ball" data-event="noball">No-ball</button><button class="secondary ball" data-event="bye">Bye</button><button class="secondary ball" data-event="legbye">Leg-bye</button><button class="danger ball" data-event="wicket">Wicket</button></div>`}
async function addBall(eventType,runs=0){
 try{await refreshAuth();if(!isAdmin)throw new Error("Only the admin can score matches.");
  const m=matches.find(x=>x.id===selectedMatchId);if(!m)throw new Error("Select a match.");if(m.status==="completed")throw new Error("Match is completed.");
  const rows=currentBallRows(m.id,innings), st=ballState(m.id,innings), active=players.filter(p=>p.joined);
  const striker=$("striker")?.value, non=$("nonStriker")?.value, bowler=$("bowler")?.value;
  if(!striker||!non||!bowler)throw new Error("Select striker, non-striker and bowler.");
  let batRuns=0,extra=0,total=0;
  if(eventType==="run"){batRuns=runs;total=runs}else if(eventType==="four"){batRuns=4;total=4}else if(eventType==="six"){batRuns=6;total=6}
  else if(eventType==="wide"||eventType==="noball"){extra=1;total=1}else if(eventType==="bye"||eventType==="legbye"){extra=Number(prompt("Extra runs","1")||1);total=extra}
  const legal=!["wide","noball"].includes(eventType);
  const row={match_id:m.id,innings,ball_number:rows.length+1,over_number:Math.floor(st.legal/6),ball_in_over:(st.legal%6)+1,striker_id:striker,non_striker_id:non,bowler_id:bowler,event_type:eventType,bat_runs:batRuns,extra_runs:extra,total_runs:total};
  if(eventType==="wicket"){row.wicket_type=prompt("Wicket type","bowled")||"wicket";row.dismissed_player_id=striker}
  const {error}=await sb.from("ball_events").insert(row);if(error)throw error;
  const all=[...rows,row];let rr=0,ww=0,ll=0;all.forEach(x=>{rr+=x.total_runs||0;if(x.event_type==="wicket")ww++;if(!["wide","noball"].includes(x.event_type))ll++});
  const key=innings===1?"a":"b", upd={status:"live"};upd[key+"_runs"]=rr;upd[key+"_wickets"]=ww;upd[key+"_overs"]=`${Math.floor(ll/6)}.${ll%6}`;
  const {error:ue}=await sb.from("matches").update(upd).eq("id",m.id);if(ue)throw ue;
  await loadRoom();selectedMatchId=m.id;renderScorePanel();
 }catch(e){showError(e)}
}
function renderScorePanel(){
 const m=matches.find(x=>x.id===selectedMatchId)||matches[0];if(!m)return;selectedMatchId=m.id;
 const st=ballState(m.id,innings), active=players.filter(p=>p.joined), opts=active.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
 const recent=currentBallRows(m.id,innings).slice(-12).reverse().map(x=>`<div class="row"><span>${x.over_number}.${x.ball_in_over} ${esc(players.find(p=>p.id===x.striker_id)?.name||"")}</span><b>${x.event_type==="run"?x.bat_runs:x.event_type==="dot"?"•":x.event_type.toUpperCase()}</b></div>`).join("")||'<div class="empty">No balls yet.</div>';
 $("ballScore").innerHTML=`<div class="card"><h2>🏏 Innings ${innings}</h2><div class="stat">${st.runs}/${st.wkts}</div><div class="muted">${st.overs} overs</div>
 <div class="grid"><div class="field"><label>Striker</label><select id="striker">${opts}</select></div><div class="field"><label>Non-striker</label><select id="nonStriker">${opts}</select></div><div class="field"><label>Bowler</label><select id="bowler">${opts}</select></div></div>${ballButtons()}
 <div class="actions" style="margin-top:12px"><button id="nextInnings" class="gold">Switch Innings</button><button id="completeMatch" class="primary">Complete Match</button></div></div>
 <div class="card"><h3>Recent deliveries</h3>${recent}</div>`;
 document.querySelectorAll(".ball").forEach(b=>b.onclick=()=>addBall(b.dataset.event,Number(b.dataset.runs||0)));
 $("nextInnings").onclick=()=>{innings=innings===1?2:1;renderScorePanel()};
 $("completeMatch").onclick=completeCurrentMatch;
}
async function completeCurrentMatch(){
 try{await refreshAuth();if(!isAdmin)throw new Error("Only the admin can complete matches.");
  const m=matches.find(x=>x.id===selectedMatchId);if(!m)throw new Error("Select a match.");
  const name=prompt(`Enter winner: ${team(m.team_a_id)?.name} or ${team(m.team_b_id)?.name}`);
  const wt=teams.find(t=>t.name.toLowerCase()===String(name||"").trim().toLowerCase());if(!wt)throw new Error("Winner team not recognised.");
  const {error}=await sb.from("matches").update({status:"completed",winner_team_id:wt.id}).eq("id",m.id);if(error)throw error;
  await loadRoom();renderScorePanel();
 }catch(e){showError(e)}
}
function render(){
 $("roomTitle").textContent=tournament.name;$("roomMeta").textContent=`${room} • ${teams.length} teams • ${matches.length} matches`;
 $("roomStatus").textContent=tournament.status==="drafting"?"Setup complete — ready to start":tournament.status==="live"?"Tournament live":"Tournament complete";
 $("startBtn").classList.toggle("hidden",tournament.status!=="drafting");
 const done=matches.filter(m=>m.status==="completed").length;
 $("tab-overview").innerHTML=`<div class="grid"><div class="card"><div class="muted">Matches</div><div class="stat">${done}/${matches.length}</div></div><div class="card"><div class="muted">Teams</div><div class="stat">${teams.length}</div></div><div class="card"><div class="muted">Players</div><div class="stat">${players.length}</div></div></div><div class="card"><h2>🏆 Standings</h2>${standings()}</div>`;
 $("tab-fixtures").innerHTML=`<div class="card"><h2>Fixtures</h2><div class="fixtures">${matches.map(m=>`<div class="fixture ${m.status==='completed'?'done':m.status==='live'?'live':''}"><h3>Match ${m.match_number}</h3><div>${esc(team(m.team_a_id)?.name)} vs ${esc(team(m.team_b_id)?.name)}</div><p class="muted">${m.status}</p><b>${m.score_a_runs}/${m.score_a_wickets} (${m.score_a_overs}) — ${m.score_b_runs}/${m.score_b_wickets} (${m.score_b_overs})</b>${m.winner_team_id?`<p class="winner">🏆 ${esc(team(m.winner_team_id)?.name)}</p>`:""}</div>`).join("")}</div></div>`;
 const sel=matches.map(m=>`<option value="${m.id}">Match ${m.match_number}: ${esc(team(m.team_a_id)?.name)} vs ${esc(team(m.team_b_id)?.name)}</option>`).join("");
 if(!isAdmin){
   $("tab-score").innerHTML=`<div class="card"><h2>🔒 Scoring</h2><p>Live scoring is restricted to the tournament administrator.</p><p class="muted">Players and spectators can view tournament information, but only the admin can record deliveries, edit scores and complete matches.</p></div>`;
 }else{
   $("tab-score").innerHTML=`<div class="card"><h2>Live Ball-by-Ball Scoring</h2><div class="field"><label>Match</label><select id="matchSelect">${matches.map(m=>`<option value="${m.id}">Match ${m.match_number}: ${esc(team(m.team_a_id)?.name)} vs ${esc(team(m.team_b_id)?.name)}</option>`).join("")}</select></div><div class="notice small">Admin-only scoring. Tap each delivery. Runs, wickets and overs are calculated automatically.</div></div><div id="ballScore"></div>`;
   selectedMatchId=matches[0]?.id||null;
   if(selectedMatchId){$("matchSelect").onchange=e=>{selectedMatchId=e.target.value;innings=1;renderScorePanel()};renderScorePanel();}
 }
 $("tab-players").innerHTML=`<div class="card"><h2>Players</h2>${players.map(p=>`<div class="row"><span>${esc(p.name)}${teams.some(t=>t.captain.toLowerCase()===p.name.toLowerCase())?" 👑":""}</span><span class="pill">${p.joined?"Joined":"Not joined"}</span></div>`).join("")}</div>`;
 $("tab-records").innerHTML=`<div class="card"><h2>Player Records</h2><table class="table"><thead><tr><th>Player</th><th>Runs</th><th>4s</th><th>6s</th><th>Wkts</th></tr></thead><tbody>${recordsRows()}</tbody></table></div>`;
 document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
}
function populateScore(id){
 const m=matches.find(x=>x.id===id);if(!m)return;
 $("aRuns").value=m.score_a_runs;$("aWkts").value=m.score_a_wickets;$("aOvers").value=m.score_a_overs;$("bRuns").value=m.score_b_runs;$("bWkts").value=m.score_b_wickets;$("bOvers").value=m.score_b_overs;$("matchStatus").value=m.status;$("winner").value=m.winner_team_id||"";
 const rows=players.filter(p=>p.joined).map(p=>{const br=bat.find(x=>x.match_id===id&&x.player_id===p.id)||{},bw=bowl.find(x=>x.match_id===id&&x.player_id===p.id)||{};return `<div class="scorecard"><b>${esc(p.name)}</b><div class="grid"><input id="r_${p.id}" type="number" placeholder="Runs" value="${br.runs||0}"><input id="bl_${p.id}" type="number" placeholder="Balls" value="${br.balls||0}"><input id="f_${p.id}" type="number" placeholder="4s" value="${br.fours||0}"><input id="s_${p.id}" type="number" placeholder="6s" value="${br.sixes||0}"><input id="o_${p.id}" type="number" step=".1" placeholder="Bowler overs" value="${bw.overs||0}"><input id="md_${p.id}" type="number" placeholder="Maidens" value="${bw.maidens||0}"><input id="br_${p.id}" type="number" placeholder="Bowler runs" value="${bw.runs||0}"><input id="w_${p.id}" type="number" placeholder="Wickets" value="${bw.wickets||0}"></div></div>`}).join("");
 $("statRows").innerHTML=rows||'<div class="empty">Players need to join before individual records can be entered.</div>';
}
function standings(){
 const out=teams.map(t=>({t,w:matches.filter(m=>m.status==="completed"&&m.winner_team_id===t.id).length,p:matches.filter(m=>m.status==="completed"&&(m.team_a_id===t.id||m.team_b_id===t.id)).length})).sort((a,b)=>b.w-a.w);
 return out.map((x,i)=>`<div class="row"><span>${i+1}. ${esc(x.t.name)}</span><span>${x.w} wins / ${x.p} played</span></div>`).join("");
}
function recordsRows(){
 const map={};bat.forEach(r=>{map[r.player_id]??={runs:0,fours:0,sixes:0,wickets:0};map[r.player_id].runs+=r.runs;map[r.player_id].fours+=r.fours;map[r.player_id].sixes+=r.sixes});bowl.forEach(r=>{map[r.player_id]??={runs:0,fours:0,sixes:0,wickets:0};map[r.player_id].wickets+=r.wickets});
 return Object.entries(map).sort((a,b)=>b[1].runs-a[1].runs).map(([id,x])=>`<tr><td>${esc(players.find(p=>p.id===id)?.name||"")}</td><td>${x.runs}</td><td>${x.fours}</td><td>${x.sixes}</td><td>${x.wickets}</td></tr>`).join("")||'<tr><td colspan="5">No records yet.</td></tr>';
}
function switchTab(t){tab=t;["overview","fixtures","score","records","players"].forEach(x=>{$("tab-"+x).classList.toggle("hidden",x!==t)});document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===t))}
function subscribe(){if(channel)sb.removeChannel(channel);channel=sb.channel("matchday:"+tournament.id).on("postgres_changes",{event:"*",schema:"public",table:"matches",filter:`tournament_id=eq.${tournament.id}`},loadRoom).on("postgres_changes",{event:"*",schema:"public",table:"players",filter:`tournament_id=eq.${tournament.id}`},loadRoom).on("postgres_changes",{event:"*",schema:"public",table:"batting_records"},loadRoom).on("postgres_changes",{event:"*",schema:"public",table:"bowling_records"},loadRoom).on("postgres_changes",{event:"*",schema:"public",table:"ball_events"},loadRoom);channel.subscribe()}
$("newBtn").onclick=()=>{hideError();if(!isAdmin){show("login");return}draftPlayers=[];draftTeams=[];$("teamCount").value=2;renderCreateForm();show("create")};
$("teamCount").oninput=renderCreateForm;
$("addPlayerBtn").onclick=addDraftPlayer;
$("playerAddInput").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();addDraftPlayer()}};
$("loginBtn").onclick=adminLogin;
$("guestBtn").onclick=()=>{hideError();show("home")};
$("homeLoginBtn").onclick=openAdminLogin;
$("adminLoginNav").onclick=openAdminLogin;
$("logoutBtn").onclick=adminLogout;$("cancelCreate").onclick=()=>show("home");$("createBtn").onclick=createTournament;$("joinBtn").onclick=join;$("startBtn").onclick=start;$("homeBtn").onclick=async()=>{history.replaceState(null,"",location.pathname);show("home");await loadTournaments()};$("shareBtn").onclick=()=>navigator.clipboard.writeText(location.href);
sb.auth.onAuthStateChange(async (_event, session)=>{authUser=session?.user||null;await refreshAuth()});
(async()=>{try{await refreshAuth();const q=new URLSearchParams(location.search);room=q.get("room");if(room){await loadRoom();openJoin(room)}else{show("home");await loadTournaments()}}catch(e){showError(e)}})();
