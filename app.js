import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const URL="https://dtgwxfibkurjbgutlcxw.supabase.co", KEY="sb_publishable_y6lWbqtfNnuiDijfWxeCTw_eyAcPwZG";
const sb=createClient(URL,KEY); const $=id=>document.getElementById(id); let tournament=null,teams=[],players=[],matches=[],bat=[],bowl=[],me="",room="",channel=null,tab="overview";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function showError(e){console.error(e);$("error").textContent=e?.message||String(e);$("error").classList.remove("hidden")}
function hideError(){$("error").classList.add("hidden")}
function show(id){["home","create","join","room"].forEach(x=>$(x).classList.toggle("hidden",x!==id))}
function team(id){return teams.find(t=>t.id===id)}
function captainFor(id){return team(id)?.captain||""}
function myTeam(){return teams.find(t=>t.captain.toLowerCase()===me.toLowerCase())}
async function loadTournaments(){
 const {data,error}=await sb.from("tournaments").select("*").order("created_at",{ascending:false}); if(error)throw error;
 $("tournamentList").innerHTML=data.length?data.map(t=>`<div class="row"><div><b>${esc(t.name)}</b><div class="muted small">${esc(t.room_code)} • ${t.match_count||1} matches • ${t.status}</div></div><button class="secondary joinRoom" data-room="${esc(t.room_code)}">Join</button></div>`).join(""):'<div class="empty">No tournaments yet. Create your first series.</div>';
 document.querySelectorAll(".joinRoom").forEach(b=>b.onclick=()=>openJoin(b.dataset.room));
}
async function createTournament(){
 try{hideError();const name=$("tName").value.trim()||"Cricket Series", n=+$("teamCount").value||2, mc=+$("matchCount").value||1;
 const tr=$("teamsInput").value.split(/\n/).map(x=>x.trim()).filter(Boolean).map((x,i)=>{let [name,captain]=x.split("|");return{name:(name||`Team ${i+1}`).trim(),captain:(captain||"").trim(),draft_order:i}});
 const pn=[...new Set($("playersInput").value.split(/\n|,/).map(x=>x.trim()).filter(Boolean))];
 if(tr.length!==n)throw new Error(`Enter exactly ${n} teams.`);
 if(pn.length<2)throw new Error("Add at least 2 players.");
 if(tr.some(x=>!x.captain))throw new Error("Every team needs a captain.");
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
 const [a,b,c,d]=await Promise.all([
 sb.from("teams").select("*").eq("tournament_id",t.id).order("draft_order"),
 sb.from("players").select("*").eq("tournament_id",t.id).order("created_at"),
 sb.from("matches").select("*").eq("tournament_id",t.id).order("match_number"),
 sb.from("batting_records").select("*")
 ]);
 if(a.error)throw a.error;if(b.error)throw b.error;if(c.error)throw c.error;
 teams=a.data;players=b.data;matches=c.data;bat=d.data||[];
 const {data:bo,error:be}=await sb.from("bowling_records").select("*");if(be)throw be;bowl=bo||[];
 render();
}
async function openJoin(code){
 try{hideError();room=code;history.replaceState(null,"",`?room=${room}`);await loadRoom();$("joinTitle").textContent=`Join ${tournament.name}`;$("joinMeta").textContent=`${teams.length} teams • ${players.length} players • ${matches.length} matches`;
 $("joinName").innerHTML='<option value="">Select your name</option>'+players.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}${teams.some(t=>t.captain.toLowerCase()===p.name.toLowerCase())?" — Captain":""}${p.joined?" — Joined":""}</option>`).join("");show("join");
 }catch(e){showError(e)}
}
async function join(){
 try{hideError();me=$("joinName").value;if(!me)throw new Error("Select your name.");
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
function render(){
 $("roomTitle").textContent=tournament.name;$("roomMeta").textContent=`${room} • ${teams.length} teams • ${matches.length} matches`;
 $("roomStatus").textContent=tournament.status==="drafting"?"Setup complete — ready to start":tournament.status==="live"?"Tournament live":"Tournament complete";
 $("startBtn").classList.toggle("hidden",tournament.status!=="drafting");
 const done=matches.filter(m=>m.status==="completed").length;
 $("tab-overview").innerHTML=`<div class="grid"><div class="card"><div class="muted">Matches</div><div class="stat">${done}/${matches.length}</div></div><div class="card"><div class="muted">Teams</div><div class="stat">${teams.length}</div></div><div class="card"><div class="muted">Players</div><div class="stat">${players.length}</div></div></div><div class="card"><h2>🏆 Standings</h2>${standings()}</div>`;
 $("tab-fixtures").innerHTML=`<div class="card"><h2>Fixtures</h2><div class="fixtures">${matches.map(m=>`<div class="fixture ${m.status==='completed'?'done':m.status==='live'?'live':''}"><h3>Match ${m.match_number}</h3><div>${esc(team(m.team_a_id)?.name)} vs ${esc(team(m.team_b_id)?.name)}</div><p class="muted">${m.status}</p><b>${m.score_a_runs}/${m.score_a_wickets} (${m.score_a_overs}) — ${m.score_b_runs}/${m.score_b_wickets} (${m.score_b_overs})</b>${m.winner_team_id?`<p class="winner">🏆 ${esc(team(m.winner_team_id)?.name)}</p>`:""}</div>`).join("")}</div></div>`;
 const sel=matches.map(m=>`<option value="${m.id}">Match ${m.match_number}: ${esc(team(m.team_a_id)?.name)} vs ${esc(team(m.team_b_id)?.name)}</option>`).join("");
 $("tab-score").innerHTML=`<div class="card"><h2>Live Score Entry</h2><div class="field"><label>Match</label><select id="matchSelect">${sel}</select></div><div class="grid"><div><h3>${esc(team(matches[0]?.team_a_id)?.name||"Team A")}</h3><input id="aRuns" type="number" placeholder="Runs"><input id="aWkts" type="number" placeholder="Wickets"><input id="aOvers" type="number" step=".1" placeholder="Overs"></div><div><h3>${esc(team(matches[0]?.team_b_id)?.name||"Team B")}</h3><input id="bRuns" type="number" placeholder="Runs"><input id="bWkts" type="number" placeholder="Wickets"><input id="bOvers" type="number" step=".1" placeholder="Overs"></div></div><div class="field"><label>Status</label><select id="matchStatus"><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="completed">Completed</option></select></div><div class="field"><label>Winner</label><select id="winner"><option value="">Select winner</option>${teams.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div><button id="saveScoreBtn" class="primary">Save Score</button></div><div class="card"><h2>Batting & Bowling Records</h2><p class="muted small">Enter player-by-player figures below for the selected match. These records are permanently stored for the tournament.</p><div id="statRows"></div></div>`;
 $("tab-players").innerHTML=`<div class="card"><h2>Players</h2>${players.map(p=>`<div class="row"><span>${esc(p.name)}${teams.some(t=>t.captain.toLowerCase()===p.name.toLowerCase())?" 👑":""}</span><span class="pill">${p.joined?"Joined":"Not joined"}</span></div>`).join("")}</div>`;
 $("tab-records").innerHTML=`<div class="card"><h2>Player Records</h2><table class="table"><thead><tr><th>Player</th><th>Runs</th><th>4s</th><th>6s</th><th>Wkts</th></tr></thead><tbody>${recordsRows()}</tbody></table></div>`;
 const m0=matches[0]; if(m0)populateScore(m0.id);
 document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
 $("saveScoreBtn").onclick=saveScore;$("matchSelect").onchange=e=>populateScore(e.target.value);
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
function subscribe(){if(channel)sb.removeChannel(channel);channel=sb.channel("matchday:"+tournament.id).on("postgres_changes",{event:"*",schema:"public",table:"matches",filter:`tournament_id=eq.${tournament.id}`},loadRoom).on("postgres_changes",{event:"*",schema:"public",table:"players",filter:`tournament_id=eq.${tournament.id}`},loadRoom).on("postgres_changes",{event:"*",schema:"public",table:"batting_records"},loadRoom).on("postgres_changes",{event:"*",schema:"public",table:"bowling_records"},loadRoom);channel.subscribe()}
$("newBtn").onclick=()=>{hideError();show("create")};$("cancelCreate").onclick=()=>show("home");$("createBtn").onclick=createTournament;$("joinBtn").onclick=join;$("startBtn").onclick=start;$("homeBtn").onclick=async()=>{history.replaceState(null,"",location.pathname);show("home");await loadTournaments()};$("shareBtn").onclick=()=>navigator.clipboard.writeText(location.href);
(async()=>{try{const q=new URLSearchParams(location.search);room=q.get("room");if(room){await loadRoom();openJoin(room)}else{show("home");await loadTournaments()}}catch(e){showError(e)}})();
