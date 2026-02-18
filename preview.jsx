// ============================================================
// COUNCIL OF LLMs — Full Preview (all modules inlined)
// For the multi-file project, see the downloaded zip.
// ============================================================

import { useState, useCallback, useEffect, useRef } from "react";

// ── councilConfig.js ──────────────────────────────────────────
const COUNCIL_MEMBERS = [
  { id: "architect",   name: "The Architect",   icon: "⬡", color: "#00D9FF", accentDark: "rgba(0,217,255,0.10)", temperature: 0.3, maxTokens: 1200,
    generationPersona: `You are a senior software architect with 20 years of experience. You value clean abstractions, SOLID principles, maintainability, and long-term scalability. You write solutions that scale to 10x the initial requirements. Format your response with clear sections. Show your architectural reasoning. Do NOT mention your role, name, or that you are an AI system.`,
    reviewLens: "architecture and maintainability — clean structure, scalability, SOLID principles, separation of concerns" },
  { id: "pragmatist",  name: "The Pragmatist",  icon: "◈", color: "#FF6B35", accentDark: "rgba(255,107,53,0.10)", temperature: 0.5, maxTokens: 900,
    generationPersona: `You are a pragmatic senior engineer. You ship working software on time. You value solutions that actually run, minimal dependencies, and code a junior can understand on day one. You avoid over-engineering. Keep your response focused and practical. Do NOT mention your role, name, or that you are an AI system.`,
    reviewLens: "practicality and clarity — does it work, is it simple, can a new team member understand it in 5 minutes" },
  { id: "innovator",   name: "The Innovator",   icon: "◬", color: "#B845FF", accentDark: "rgba(184,69,255,0.10)", temperature: 0.9, maxTokens: 1000,
    generationPersona: `You are a creative technologist who explores the frontier of what's possible. You value novel approaches, elegant algorithms, and unconventional thinking. Look for the solution that makes others say "I never thought of that." Show your reasoning for why a less-obvious approach is superior. Do NOT mention your role, name, or that you are an AI system.`,
    reviewLens: "innovation and elegance — novel approaches, cutting-edge techniques, solving the root problem not symptoms" },
  { id: "guardian",    name: "The Guardian",    icon: "⬟", color: "#FFD700", accentDark: "rgba(255,215,0,0.10)",  temperature: 0.2, maxTokens: 1300,
    generationPersona: `You are a security and reliability engineer. You find the holes in every plan. You value input validation, error handling, edge cases, security implications, and graceful degradation. Your solution handles the happy path AND every failure mode. Call out assumptions explicitly. Do NOT mention your role, name, or that you are an AI system.`,
    reviewLens: "robustness and security — error handling, edge cases, security vulnerabilities, unstated assumptions" },
  { id: "minimalist",  name: "The Minimalist",  icon: "○", color: "#FF4D8B", accentDark: "rgba(255,77,139,0.10)", temperature: 0.6, maxTokens: 700,
    generationPersona: `You are a developer who believes every line of code is a liability. You value fewest possible lines, highest signal-to-noise ratio, zero unnecessary dependencies. Make it as simple as it can be, but no simpler. Do NOT mention your role, name, or that you are an AI system.`,
    reviewLens: "simplicity — fewest lines, clearest intent, every line earning its place, minimum viable complexity" },
];
const MEMBER_MAP = Object.fromEntries(COUNCIL_MEMBERS.map(m => [m.id, m]));
const ANONYMOUS_LABELS = ["Submission Alpha","Submission Beta","Submission Gamma","Submission Delta","Submission Epsilon"];
const PHASES = { IDLE:"idle", GENERATING:"generating", REVIEWING:"reviewing", SCORING:"scoring", RESULTS:"results" };

// ── anonymizer.js ─────────────────────────────────────────────
function cryptoRandInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  let r; do { const a = new Uint32Array(1); crypto.getRandomValues(a); r = a[0]; } while (r >= limit);
  return r % max;
}
function cryptoShuffle(arr) {
  const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=cryptoRandInt(i+1);[a[i],a[j]]=[a[j],a[i]];} return a;
}
function anonymizeOutputs(outputs) {
  const shuffled = cryptoShuffle(outputs);
  const revealMap = new Map();
  const anonymized = shuffled.map((o,i)=>{ const label=ANONYMOUS_LABELS[i]; revealMap.set(label,o.memberId); return {label,content:o.content}; });
  return {anonymized,revealMap};
}

// ── sanitizer.js ──────────────────────────────────────────────
const IDENTITY_LEAK_PATTERNS = [
  /\b(as an? (AI|language model|LLM|assistant|claude|gpt|gemini))\b/gi,
  /\b(I('m| am) (claude|gpt|an AI|an artificial intelligence))\b/gi,
  /\b(my (approach|solution|answer) (is|provides?|offers?))\b/gi,
  /\b(I (believe|think) (my|this) (solution|approach))\b/gi,
  /\bclaude[\s-]*(sonnet|opus|haiku)/gi,
];
function sanitizeOutput(text) {
  let sanitized = text; const flagged = [];
  for (const p of IDENTITY_LEAK_PATTERNS) { const m=sanitized.match(p); if(m){flagged.push(...m); sanitized=sanitized.replace(p,"[REDACTED]");} }
  return {sanitized:sanitized.trim(), flaggedPatterns:flagged};
}
function sanitizePrompt(prompt) {
  let sanitized=prompt.trim(); const warnings=[];
  if(/ignore.*instructions/gi.test(sanitized)){warnings.push("Injection attempt filtered");sanitized=sanitized.replace(/ignore.*instructions/gi,"[FILTERED]");}
  if(sanitized.length>4000){warnings.push("Prompt truncated to 4000 chars");sanitized=sanitized.slice(0,4000)+"...";}
  return {sanitized,warnings};
}

// ── biasGuard.js ──────────────────────────────────────────────
function checkReviewBias(review) {
  const violations=[];
  if((review.reason||"").split(/\s+/).length < 8) violations.push("Reasoning too brief — insufficient justification");
  const selfRef=/\b(I wrote|my output|I created|I generated|my solution)\b/gi;
  if(selfRef.test(review.reason||"")) violations.push("Self-referential language detected and redacted");
  const severity=violations.length===0?"low":violations.length<=1?"low":"medium";
  return {passed:violations.length===0, violations, severity};
}
function checkCouncilGroupthink(reviews) {
  const votes=reviews.map(r=>r.vote); const unique=new Set(votes).size;
  const warnings=[];
  const alphaVotes=votes.filter(v=>v==="Submission Alpha").length;
  if(alphaVotes>=Math.ceil(reviews.length*0.8)) warnings.push(`Potential first-position anchoring: ${alphaVotes}/${reviews.length} votes for Alpha`);
  if(unique===1) warnings.push("Unanimous groupthink: all reviewers voted identically");
  return {anchoring:alphaVotes>=4, groupthink:unique===1, warnings};
}

// ── API client ─────────────────────────────────────────────────
let _reqN=0;
async function callLLM({system,user,temperature=0.7,maxTokens=1000}) {
  const reqId=`req_${Date.now()}_${++_reqN}`;
  const res=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:maxTokens,temperature,system,messages:[{role:"user",content:user}]})
  });
  if(!res.ok) throw new Error(`API ${res.status}`);
  const data=await res.json();
  const text=data.content?.find(b=>b.type==="text")?.text?.trim();
  if(!text) throw new Error("No text in response");
  return {text, reqId, tokensUsed:data.usage?.output_tokens??0};
}

// ── deliberation.js ───────────────────────────────────────────
async function runDeliberation(member, prompt, anonymizedOutputs) {
  const labelList=anonymizedOutputs.map(o=>o.label);
  const submissionsText=anonymizedOutputs.map(o=>`=== ${o.label} ===\n${o.content}\n${"=".repeat(36)}`).join("\n\n");
  const system=`You are an expert technical reviewer on an anonymous peer review panel.
You evaluate through the lens of: ${member.reviewLens}.
CRITICAL RULES:
1. You do NOT know who wrote any submission. Authors are anonymous.
2. NEVER use phrases like "I wrote", "my output", "my solution", "I think I", "I believe I".
3. Base ALL judgments on content alone.
4. Provide COMPARATIVE analysis: why winner beats the others specifically.
5. Identify the weakest submission and explain why.
6. Your response MUST be valid JSON only — no markdown, no preamble.`;

  const user=`ORIGINAL PROMPT: "${prompt}"\n\nANONYMOUS SUBMISSIONS:\n${submissionsText}\n\nReturn ONLY this JSON:\n{"vote":"<${labelList.join("|")}>","ranking":["<best>","<2nd>","<3rd>","<4th>","<worst>"],"reason":"<2-4 sentences: WHY winner beats the specific alternatives, name the runner-up>","detailedAnalysis":{"${labelList[0]}":{"strengths":"...","weaknesses":"...","score":7},"${labelList[1]}":{"strengths":"...","weaknesses":"...","score":6},"${labelList[2]}":{"strengths":"...","weaknesses":"...","score":5},"${labelList[3]}":{"strengths":"...","weaknesses":"...","score":4},"${labelList[4]}":{"strengths":"...","weaknesses":"...","score":3}},"tradeoffs":"<honest weaknesses of your top pick>","worstSubmission":"<label>","worstReason":"<why worst>"}`;

  const {text,reqId}=await callLLM({system,user,temperature:0.3,maxTokens:1600,memberId:member.id});
  let parsed;
  try { parsed=JSON.parse(text.replace(/^```(?:json)?\s*/i,"").replace(/\s*```\s*$/,"").trim()); }
  catch { const m=text.match(/\{[\s\S]*\}/); try{parsed=m?JSON.parse(m[0]):null;}catch{parsed=null;} }
  if(!parsed){parsed={vote:labelList[0],ranking:labelList,reason:"Parse failed.",detailedAnalysis:{},tradeoffs:"",worstSubmission:labelList[4],worstReason:"Parse failed."};}
  const validLabels=new Set(labelList);
  return {
    reviewerId:member.id,
    vote:validLabels.has(parsed.vote)?parsed.vote:labelList[0],
    ranking:Array.isArray(parsed.ranking)?parsed.ranking.filter(l=>validLabels.has(l)):labelList,
    reason:parsed.reason||"",
    detailedAnalysis:parsed.detailedAnalysis||{},
    tradeoffs:parsed.tradeoffs||"",
    worstSubmission:validLabels.has(parsed.worstSubmission)?parsed.worstSubmission:null,
    worstReason:parsed.worstReason||"",
    reqId,
  };
}

// ── scorer.js ─────────────────────────────────────────────────
function computeScores(reviews,anonymizedOutputs) {
  const labels=anonymizedOutputs.map(o=>o.label);
  const buckets=Object.fromEntries(labels.map(l=>[l,{label:l,votes:0,topRankings:0,avgScore:0,worstVotes:0,composite:0,voterIds:[],rawScores:[],memberId:null}]));
  for(const r of reviews){
    if(buckets[r.vote]){buckets[r.vote].votes++;buckets[r.vote].voterIds.push(r.reviewerId);}
    const top=r.ranking?.[0]; if(top&&buckets[top]) buckets[top].topRankings++;
    for(const l of labels){const a=r.detailedAnalysis?.[l];if(typeof a?.score==="number"&&buckets[l])buckets[l].rawScores.push(Math.max(1,Math.min(10,a.score)));}
    if(r.worstSubmission&&buckets[r.worstSubmission]) buckets[r.worstSubmission].worstVotes++;
  }
  const scores=labels.map(l=>{
    const b=buckets[l];
    b.avgScore=b.rawScores.length>0?b.rawScores.reduce((a,c)=>a+c,0)/b.rawScores.length:5;
    b.composite=b.votes*4+b.topRankings*1.5+(b.avgScore/10)*2-b.worstVotes*1;
    return b;
  }).sort((a,b)=>b.composite-a.composite);
  return {scores,winner:scores[0],tiebroken:scores.length>=2&&scores[0].composite===scores[1].composite};
}

// ── Styles ────────────────────────────────────────────────────
const S = {
  void:"#07090F", surface:"#0D1117", raised:"#141923", overlay:"#1A2030",
  accent:"#00E5C3", accentDim:"rgba(0,229,195,0.12)", accentGlow:"rgba(0,229,195,0.25)",
  success:"#22D07A", warning:"#F5A623", danger:"#F05A5A", info:"#4A9EFF",
  text:"#E8EDF4", textSec:"#8895A7", textMut:"#3D4A5C",
  border:"rgba(255,255,255,0.05)", borderSoft:"rgba(255,255,255,0.10)",
};

const css=`
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&family=Bebas+Neue&family=DM+Sans:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:${S.void};color:${S.text};font-family:'DM Sans',sans-serif;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:${S.overlay};border-radius:3px}
.display{font-family:'Bebas Neue',sans-serif;letter-spacing:3px}
.mono{font-family:'IBM Plex Mono',monospace}
@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.65)}}
@keyframes fade-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
@keyframes slide-up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fade-in .3s ease}
.slide-up{animation:slide-up .4s ease}
.grid-bg{position:fixed;inset:0;pointer-events:none;z-index:0;
  background-image:linear-gradient(rgba(0,229,195,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,195,0.025) 1px,transparent 1px);
  background-size:32px 32px;
  mask-image:radial-gradient(ellipse 90% 90% at 50% 50%,black 20%,transparent 100%)}
`;

// ── Components ────────────────────────────────────────────────
function Chip({children,color="var(--text-muted)",bg=S.raised,border=S.border}){
  return<span className="mono"style={{padding:"3px 10px",background:bg,border:`1px solid ${border}`,borderRadius:6,fontSize:10,color,letterSpacing:1}}>{children}</span>;
}

function MemberRow({phase,generatingFor,reviewingFor,doneGen,doneRev}){
  return(
    <div style={{display:"flex",gap:8,padding:"10px 24px",background:S.surface,borderBottom:`1px solid ${S.border}`,overflowX:"auto",position:"relative",zIndex:5}}>
      {COUNCIL_MEMBERS.map(m=>{
        const active=generatingFor===m.id||reviewingFor===m.id;
        const done=phase===PHASES.GENERATING?doneGen.has(m.id):doneRev.has(m.id);
        return(
          <div key={m.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",
            background:active?m.accentDark:S.raised,
            border:`1px solid ${active?m.color+"50":done?m.color+"20":S.border}`,
            borderRadius:8,transition:"all .3s",flexShrink:0}}>
            <span style={{color:active||done?m.color:S.textMut,fontSize:12}}>{m.icon}</span>
            <span className="mono"style={{fontSize:9,color:active?m.color:done?"#5a6a7a":S.textMut,letterSpacing:1,fontWeight:700}}>
              {m.name.replace("The ","").toUpperCase()}
            </span>
            {active&&<span style={{width:5,height:5,borderRadius:"50%",background:m.color,animation:"pulse-dot .8s infinite",flexShrink:0}}/>}
            {done&&!active&&<span style={{fontSize:8,color:S.success}}>✓</span>}
          </div>
        );
      })}
    </div>
  );
}

function OutputCard({label,content,isWinner,revealedMemberId,reviews,score,votes}){
  const m=revealedMemberId?MEMBER_MAP[revealedMemberId]:null;
  return(
    <div className="fade-in"style={{background:S.surface,border:`1px solid ${isWinner?(m?.color??S.accent)+"50":S.borderSoft}`,
      borderRadius:12,overflow:"hidden",
      boxShadow:isWinner?`0 0 20px ${(m?.color??S.accent)}20`:undefined}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",
        background:S.raised,borderBottom:`1px solid ${S.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {m&&<span style={{color:m.color,fontSize:13}}>{m.icon}</span>}
          <div>
            <div className="mono"style={{fontSize:10,fontWeight:700,color:m?m.color:S.textSec,letterSpacing:1}}>
              {m?m.name.toUpperCase():label.toUpperCase()}
            </div>
            {m&&<div className="mono"style={{fontSize:8,color:S.textMut}}>{label}</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {isWinner&&<Chip color={S.accent} bg={S.accentDim} border={S.accentGlow}>🏆 WINNER</Chip>}
          {votes>0&&<span className="mono"style={{fontSize:10,color:S.textMut}}>{votes}v</span>}
          {score!=null&&<span className="mono"style={{fontSize:11,fontWeight:700,color:score>=7?S.success:score>=5?S.accent:S.warning}}>{score?.toFixed(1)}</span>}
        </div>
      </div>
      <div style={{padding:"12px 14px",maxHeight:240,overflowY:"auto"}}>
        <pre style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,lineHeight:1.7,color:S.textSec,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0}}>
          {content}
        </pre>
      </div>
      {reviews.length>0&&(
        <div style={{borderTop:`1px solid ${S.border}`,padding:"10px 14px"}}>
          <div className="mono"style={{fontSize:8,color:S.textMut,letterSpacing:2,marginBottom:6}}>REVIEWER SCORES</div>
          {reviews.map(({reviewerId,score:sc,strengths,weaknesses})=>{
            const rev=MEMBER_MAP[reviewerId]; if(!rev)return null;
            return(
              <div key={reviewerId} style={{display:"flex",gap:8,marginBottom:5}}>
                <span style={{color:rev.color,fontSize:10,flexShrink:0,marginTop:1}}>{rev.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  {sc!=null&&<span className="mono"style={{fontSize:9,color:sc>=7?S.success:sc>=5?S.accent:S.warning}}>{sc}/10 </span>}
                  {strengths&&<span className="mono"style={{fontSize:9,color:S.success}}>+ {strengths.slice(0,80)}{strengths.length>80?"...":""}</span>}
                  {weaknesses&&<div className="mono"style={{fontSize:9,color:S.danger}}>− {weaknesses.slice(0,80)}{weaknesses.length>80?"...":""}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReviewCard({review}){
  const reviewer=MEMBER_MAP[review.reviewerId]; if(!reviewer)return null;
  const biasCheck=review.biasCheck??{passed:true,violations:[]};
  return(
    <div className="fade-in"style={{background:S.surface,border:`1px solid ${S.borderSoft}`,borderRadius:12,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",background:reviewer.accentDark,borderBottom:`1px solid ${S.border}`}}>
        <span style={{fontSize:16,color:reviewer.color}}>{reviewer.icon}</span>
        <div style={{flex:1}}>
          <div className="mono"style={{fontSize:10,color:reviewer.color,fontWeight:700,letterSpacing:1}}>{reviewer.name.toUpperCase()}</div>
          <div className="mono"style={{fontSize:8,color:S.textMut,letterSpacing:1}}>LENS: {reviewer.reviewLens.split("—")[0].trim().toUpperCase()}</div>
        </div>
        <Chip color={reviewer.color} bg={S.surface} border={reviewer.color+"40"}>VOTED: {review.vote}</Chip>
      </div>
      <div style={{padding:"14px 16px"}}>
        <div className="mono"style={{fontSize:8,color:S.textMut,letterSpacing:2,marginBottom:6}}>WHY THIS SUBMISSION WON</div>
        <p style={{fontSize:12,color:S.textSec,lineHeight:1.75,marginBottom:14}}>{review.reason||"No reasoning."}</p>

        {review.ranking?.length>0&&(
          <div style={{marginBottom:14}}>
            <div className="mono"style={{fontSize:8,color:S.textMut,letterSpacing:2,marginBottom:6}}>FULL RANKING</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {review.ranking.map((l,i)=>(
                <span key={l} className="mono"style={{padding:"2px 8px",borderRadius:4,fontSize:9,
                  background:i===0?S.accentDim:S.overlay,
                  border:`1px solid ${i===0?S.accentGlow:S.border}`,
                  color:i===0?S.accent:i===review.ranking.length-1?S.danger:S.textMut}}>
                  #{i+1} {l}
                </span>
              ))}
            </div>
          </div>
        )}

        {Object.keys(review.detailedAnalysis||{}).length>0&&(
          <div style={{marginBottom:14}}>
            <div className="mono"style={{fontSize:8,color:S.textMut,letterSpacing:2,marginBottom:8}}>PER-SUBMISSION ANALYSIS</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {Object.entries(review.detailedAnalysis).map(([label,data])=>{
                if(!data)return null;
                const isVoted=label===review.vote;
                const sc=typeof data.score==="number"?data.score:null;
                return(
                  <div key={label} style={{padding:"10px 12px",background:isVoted?reviewer.accentDark:S.raised,
                    border:`1px solid ${isVoted?reviewer.color+"30":S.border}`,borderRadius:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span className="mono"style={{fontSize:9,fontWeight:700,color:isVoted?reviewer.color:S.textMut,letterSpacing:1}}>{label}{isVoted?" ★":""}</span>
                      {sc!=null&&<span className="mono"style={{fontSize:10,fontWeight:700,color:sc>=7?S.success:sc>=5?S.accent:S.warning}}>{sc}/10</span>}
                    </div>
                    {data.strengths&&<div className="mono"style={{fontSize:10,color:S.success,lineHeight:1.5}}>＋ {data.strengths}</div>}
                    {data.weaknesses&&<div className="mono"style={{fontSize:10,color:S.danger,lineHeight:1.5,marginTop:3}}>− {data.weaknesses}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {review.tradeoffs&&(
          <div style={{padding:"8px 12px",background:"rgba(245,166,35,0.06)",border:"1px solid rgba(245,166,35,0.2)",borderRadius:8,
            fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:S.warning,lineHeight:1.6,marginBottom:10}}>
            ⚠ TRADEOFFS: {review.tradeoffs}
          </div>
        )}
        {review.worstSubmission&&(
          <div style={{padding:"8px 12px",background:"rgba(240,90,90,0.06)",border:"1px solid rgba(240,90,90,0.2)",borderRadius:8,
            fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:S.danger,lineHeight:1.6}}>
            WEAKEST — {review.worstSubmission}: {review.worstReason}
          </div>
        )}
        {!biasCheck.passed&&biasCheck.violations.length>0&&(
          <div style={{marginTop:8,padding:"6px 10px",background:"rgba(74,158,255,0.08)",border:"1px solid rgba(74,158,255,0.2)",borderRadius:6}}>
            {biasCheck.violations.map((v,i)=><div key={i} className="mono"style={{fontSize:9,color:S.info}}>⚠ {v}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

function VerdictScreen({breakdown,scores,biasReport}){
  if(!breakdown)return null;
  const{winner,runnerUp,weakest}=breakdown;
  const wm=MEMBER_MAP[winner.memberId];
  const maxC=Math.max(...scores.map(s=>s.composite),1);
  return(
    <div className="slide-up">
      {/* Banner */}
      <div style={{position:"relative",overflow:"hidden",background:S.surface,border:`1px solid ${(wm?.color??S.accent)+"50"}`,borderRadius:16,padding:"32px 24px",marginBottom:20,textAlign:"center"}}>
        <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:"60%",height:120,
          background:`radial-gradient(ellipse at 50% 0%,${(wm?.color??S.accent)}20,transparent 70%)`,pointerEvents:"none"}}/>
        <div style={{position:"relative"}}>
          <div style={{fontSize:32,marginBottom:8}}>🏆</div>
          <div className="display"style={{fontSize:36,color:wm?.color??S.accent,lineHeight:1}}>{winner.label}</div>
          <div className="mono"style={{fontSize:9,color:S.textMut,letterSpacing:3,margin:"8px 0 4px"}}>IDENTITY REVEALED</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <span style={{fontSize:20,color:wm?.color}}>{wm?.icon}</span>
            <span className="display"style={{fontSize:22,color:wm?.color??S.accent,letterSpacing:3}}>{wm?.name?.toUpperCase()??"UNKNOWN"}</span>
          </div>
          <div className="mono"style={{fontSize:10,color:S.textMut,marginTop:6}}>
            Composite: <span style={{color:S.accent,fontWeight:700}}>{winner.composite?.toFixed(2)}</span>
            {" · "}Votes: <span style={{color:S.accent}}>{winner.votes}</span>
            {" · "}Avg: <span style={{color:S.accent}}>{winner.avgScore?.toFixed(1)}/10</span>
          </div>
        </div>
      </div>

      {/* Bias report */}
      {biasReport?.warnings?.length>0&&(
        <div style={{padding:"10px 14px",marginBottom:16,background:"rgba(245,166,35,0.07)",border:"1px solid rgba(245,166,35,0.25)",borderRadius:8}}>
          <div className="mono"style={{fontSize:8,color:S.warning,letterSpacing:2,marginBottom:4}}>BIAS DETECTION REPORT</div>
          {biasReport.warnings.map((w,i)=><div key={i} className="mono"style={{fontSize:10,color:S.warning}}>⚠ {w}</div>)}
        </div>
      )}

      {/* Composite table */}
      <div style={{marginBottom:20}}>
        <div className="mono"style={{fontSize:8,color:S.textMut,letterSpacing:2,marginBottom:12}}>COMPOSITE SCORE BREAKDOWN</div>
        {scores.map((s,rank)=>{
          const m=MEMBER_MAP[s.memberId]; const iW=s.label===winner.label; const pct=Math.min(100,(s.composite/maxC)*100);
          return(
            <div key={s.label} style={{padding:"10px 14px",marginBottom:8,
              background:iW?S.accentDim:S.raised,border:`1px solid ${iW?S.accentGlow:S.border}`,borderRadius:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span className="mono"style={{fontSize:9,color:S.textMut,width:18}}>#{rank+1}</span>
                  {m&&<span style={{color:m.color,fontSize:12}}>{m.icon}</span>}
                  <div>
                    <div className="mono"style={{fontSize:9,color:m?m.color:S.text,fontWeight:700}}>{m?m.name:s.label}</div>
                    <div className="mono"style={{fontSize:7,color:S.textMut}}>{s.label}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:12}}>
                  {[["VOTES",s.votes,s.votes>0?S.accent:S.textMut],["AVG",s.avgScore?.toFixed(1),S.textSec],["WORST",`-${s.worstVotes}`,s.worstVotes>0?S.danger:S.textMut],["SCORE",s.composite?.toFixed(2),iW?S.accent:S.text]].map(([k,v,c])=>(
                    <div key={k} style={{textAlign:"right"}}>
                      <div className="mono"style={{fontSize:7,color:S.textMut}}>{k}</div>
                      <div className="mono"style={{fontSize:11,fontWeight:700,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{height:4,borderRadius:2,background:S.overlay}}>
                <div style={{height:"100%",width:`${pct}%`,background:iW?S.accent:(m?.color??"#fff"),borderRadius:2,transition:"width .8s ease"}}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Why winner reasoning */}
      {winner.reasons?.length>0&&(
        <div style={{marginBottom:16}}>
          <div className="mono"style={{fontSize:8,color:S.textMut,letterSpacing:2,marginBottom:10}}>WHY THIS SUBMISSION WON — VOTER REASONING</div>
          {winner.reasons.map(({reviewerId,reason})=>{
            const rev=MEMBER_MAP[reviewerId];
            return(
              <div key={reviewerId} style={{display:"flex",gap:10,marginBottom:10,padding:"10px 12px",
                background:S.raised,borderRadius:8,borderLeft:`3px solid ${rev?.color??S.accent}`}}>
                <span style={{color:rev?.color,fontSize:13,flexShrink:0}}>{rev?.icon}</span>
                <div>
                  <div className="mono"style={{fontSize:8,color:rev?.color,letterSpacing:1,marginBottom:3}}>{rev?.name?.toUpperCase()}</div>
                  <p style={{fontSize:12,color:S.textSec,lineHeight:1.7}}>{reason}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tradeoffs / weaknesses */}
      {winner.tradeoffs?.length>0&&(
        <div style={{marginBottom:16}}>
          <div className="mono"style={{fontSize:8,color:S.warning,letterSpacing:2,marginBottom:8}}>HONEST TRADEOFFS IN WINNING SUBMISSION</div>
          {winner.tradeoffs.filter(Boolean).map((t,i)=>(
            <div key={i} style={{padding:"8px 12px",background:"rgba(245,166,35,0.06)",border:"1px solid rgba(245,166,35,0.2)",borderRadius:8,marginBottom:6,
              fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:S.warning,lineHeight:1.6}}>⚠ {t}</div>
          ))}
        </div>
      )}

      {/* Weakest */}
      {weakest&&(
        <div style={{padding:"10px 14px",background:"rgba(240,90,90,0.06)",border:"1px solid rgba(240,90,90,0.2)",borderRadius:8}}>
          <div className="mono"style={{fontSize:8,color:S.danger,letterSpacing:2,marginBottom:4}}>WEAKEST SUBMISSION</div>
          <div className="mono"style={{fontSize:11,color:S.danger}}>{weakest.label} · avg {weakest.avgScore?.toFixed(1)}/10 · worst-voted {weakest.worstVotes}x</div>
        </div>
      )}
    </div>
  );
}

function ActivityLog({entries}){
  const ref=useRef(null);
  useEffect(()=>{ref.current?.scrollIntoView({behavior:"smooth"});},[entries.length]);
  if(!entries.length)return null;
  const cols={info:S.textMut,warn:S.warning,error:S.danger,success:S.success};
  return(
    <div style={{background:S.surface,border:`1px solid ${S.borderSoft}`,borderRadius:10,overflow:"hidden",marginBottom:20}}>
      <div style={{display:"flex",justifyContent:"space-between",padding:"7px 14px",background:S.raised,borderBottom:`1px solid ${S.border}`}}>
        <span className="mono"style={{fontSize:8,color:S.textMut,letterSpacing:2}}>SESSION LOG</span>
        <span className="mono"style={{fontSize:8,color:S.textMut}}>{entries.length}</span>
      </div>
      <div style={{maxHeight:140,overflowY:"auto",padding:"8px 14px"}}>
        {entries.map((e,i)=>(
          <div key={i} style={{display:"flex",gap:10,marginBottom:3,animation:i===entries.length-1?"fade-in .2s ease":"none"}}>
            <span className="mono"style={{fontSize:8,color:"#1e2a38",flexShrink:0}}>
              {new Date(e.timestamp).toLocaleTimeString("en-US",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"})}
            </span>
            <span className="mono"style={{fontSize:10,color:cols[e.level]??S.textMut,lineHeight:1.5}}>{e.message}</span>
          </div>
        ))}
        <div ref={ref}/>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────
const EXAMPLES=["Write a function to find all prime numbers up to N","Design a rate limiter for a REST API","Implement an LRU cache with O(1) get and put","Create a debounce function in JavaScript","Write a binary search tree with insert, delete, and search"];
const TABS=[{id:"outputs",label:"SUBMISSIONS",icon:"◧"},{id:"reviews",label:"PEER REVIEWS",icon:"◨"},{id:"verdict",label:"VERDICT",icon:"⬡"}];

export default function App(){
  const[phase,setPhase]=useState(PHASES.IDLE);
  const[promptVal,setPromptVal]=useState("");
  const[promptWarnings,setPromptWarnings]=useState([]);
  const[outputs,setOutputs]=useState([]);
  const[anonOutputs,setAnonOutputs]=useState([]);
  const[reviews,setReviews]=useState([]);
  const[scores,setScores]=useState([]);
  const[breakdown,setBreakdown]=useState(null);
  const[biasReport,setBiasReport]=useState(null);
  const[log,setLog]=useState([]);
  const[genFor,setGenFor]=useState(null);
  const[revFor,setRevFor]=useState(null);
  const[tab,setTab]=useState("outputs");
  const[tokens,setTokens]=useState(0);
  const[error,setError]=useState(null);
  const revealMapRef=useRef(null);

  const addLog=(message,level="info")=>setLog(p=>[...p,{message,level,timestamp:Date.now()}]);

  useEffect(()=>{
    if(phase===PHASES.REVIEWING||phase===PHASES.SCORING) setTab("reviews");
    if(phase===PHASES.RESULTS) setTab("verdict");
  },[phase]);

  async function runSession(rawPrompt){
    revealMapRef.current=null;
    setPhase(PHASES.GENERATING);setOutputs([]);setAnonOutputs([]);setReviews([]);setScores([]);setBreakdown(null);setBiasReport(null);setLog([]);setError(null);setTokens(0);

    const{sanitized,warnings}=sanitizePrompt(rawPrompt);
    setPromptWarnings(warnings);
    if(warnings.length) warnings.forEach(w=>addLog(`⚠️ ${w}`,"warn"));
    addLog("🏛️ Council convening — 5 independent deliberations beginning...");

    const outs=[];
    for(const m of COUNCIL_MEMBERS){
      setGenFor(m.id); addLog(`${m.icon} ${m.name} crafting response (temp=${m.temperature})...`);
      try{
        const{text,reqId,tokensUsed}=await callLLM({system:m.generationPersona,user:sanitized,temperature:m.temperature,maxTokens:m.maxTokens,memberId:m.id});
        setTokens(p=>p+tokensUsed);
        const{sanitized:sc,flaggedPatterns:fp}=sanitizeOutput(text);
        if(fp.length) addLog(`🛡️ ${m.name}: ${fp.length} identity pattern(s) redacted`,"warn");
        outs.push({memberId:m.id,content:sc,reqId,flaggedPatterns:fp});
        setOutputs(p=>[...p,{memberId:m.id,content:sc,reqId}]);
      }catch(e){setError(`Generation failed for ${m.name}: ${e.message}`);setPhase(PHASES.IDLE);return;}
    }
    setGenFor(null); addLog("✅ All 5 responses generated. Anonymizing with crypto shuffle...");

    const{anonymized,revealMap}=anonymizeOutputs(outs);
    revealMapRef.current=revealMap;
    setAnonOutputs(anonymized);
    setPhase(PHASES.REVIEWING);
    addLog("🔀 Outputs anonymized. Identities sealed until verdict.");

    const revs=[];
    for(const m of COUNCIL_MEMBERS){
      setRevFor(m.id); addLog(`🔍 ${m.name} reviewing all anonymous submissions...`);
      try{
        const rev=await runDeliberation(m,sanitized,anonymized);
        const bc=checkReviewBias(rev);
        if(!bc.passed) addLog(`⚠️ Bias in ${m.name}'s review: ${bc.violations[0]}`,"warn");
        revs.push({...rev,biasCheck:bc});
        setReviews(p=>[...p,{...rev,biasCheck:bc}]);
      }catch(e){addLog(`❌ Review failed for ${m.name}: ${e.message}`,"error");}
    }
    setRevFor(null);
    if(!revs.length){setError("All reviews failed.");setPhase(PHASES.IDLE);return;}

    const gr=checkCouncilGroupthink(revs);
    setBiasReport(gr);
    if(gr.warnings.length) gr.warnings.forEach(w=>addLog(`⚠️ ${w}`,"warn"));
    addLog("📊 Computing composite scores...");
    setPhase(PHASES.SCORING);

    const{scores:sc,winner}=computeScores(revs,anonymized);

    // Build breakdown with reveal
    const winnerMemberId=revealMap.get(winner.label);
    const wm=MEMBER_MAP[winnerMemberId];
    const winnerReasons=revs.filter(r=>r.vote===winner.label).map(r=>({reviewerId:r.reviewerId,reason:r.reason}));
    const winnerCritiques=revs.map(r=>({reviewerId:r.reviewerId,critique:r.detailedAnalysis?.[winner.label]?.weaknesses??null,score:r.detailedAnalysis?.[winner.label]?.score??null})).filter(r=>r.critique);
    const tradeoffs=revs.filter(r=>r.vote===winner.label).map(r=>r.tradeoffs).filter(Boolean);

    // attach memberId to scores via revealMap
    const scoredFull=sc.map(s=>({...s,memberId:revealMap.get(s.label)}));
    setScores(scoredFull);

    const bd={
      winner:{label:winner.label,memberId:winnerMemberId,composite:winner.composite,votes:winner.votes,avgScore:winner.avgScore,reasons:winnerReasons,critiques:winnerCritiques,tradeoffs},
      runnerUp:scoredFull[1]?{label:scoredFull[1].label,memberId:revealMap.get(scoredFull[1].label),composite:scoredFull[1].composite,votes:scoredFull[1].votes,avgScore:scoredFull[1].avgScore}:null,
      weakest:{label:scoredFull[scoredFull.length-1].label,memberId:revealMap.get(scoredFull[scoredFull.length-1].label),worstVotes:scoredFull[scoredFull.length-1].worstVotes,avgScore:scoredFull[scoredFull.length-1].avgScore},
    };
    setBreakdown(bd);
    addLog(`🏆 Winner: ${winner.label} (composite ${winner.composite.toFixed(2)})`,"success");
    addLog(`🎭 Identity: ${wm?.icon} ${wm?.name}`,"success");
    setPhase(PHASES.RESULTS);
  }

  function reset(){revealMapRef.current=null;setPhase(PHASES.IDLE);setPromptVal("");setOutputs([]);setAnonOutputs([]);setReviews([]);setScores([]);setBreakdown(null);setBiasReport(null);setLog([]);setError(null);setTokens(0);setGenFor(null);setRevFor(null);}

  const isIdle=phase===PHASES.IDLE;
  const isActive=!isIdle;
  const doneGen=new Set(outputs.map(o=>o.memberId));
  const doneRev=new Set(reviews.map(r=>r.reviewerId));
  const showOutputs=anonOutputs.length>0;
  const showReviews=reviews.length>0;
  const showVerdict=phase===PHASES.RESULTS&&breakdown;

  function getRevScores(label){return reviews.map(r=>({reviewerId:r.reviewerId,score:r.detailedAnalysis?.[label]?.score??null,strengths:r.detailedAnalysis?.[label]?.strengths??null,weaknesses:r.detailedAnalysis?.[label]?.weaknesses??null}));}

  return(
    <div style={{minHeight:"100vh",background:S.void,display:"flex",flexDirection:"column"}}>
      <style>{css}</style>
      <div className="grid-bg"/>

      {/* Header */}
      <header style={{position:"relative",zIndex:10,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:52,background:S.surface,borderBottom:`1px solid ${S.borderSoft}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:24,height:24,border:`1px solid ${S.accent}`,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:S.accent,boxShadow:`0 0 8px ${S.accentGlow}`}}>⬡</div>
          <span className="display"style={{fontSize:16,color:S.text,letterSpacing:4}}>COUNCIL</span>
          <span className="mono"style={{fontSize:8,color:S.textMut,letterSpacing:2}}>OF LLMS v2</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {tokens>0&&<span className="mono"style={{fontSize:9,color:S.textMut}}>~{tokens.toLocaleString()} tokens</span>}
          {phase===PHASES.RESULTS&&<button onClick={reset}style={{padding:"5px 12px",background:"transparent",border:`1px solid ${S.borderSoft}`,borderRadius:6,color:S.textSec,fontFamily:"'IBM Plex Mono',monospace",fontSize:9,cursor:"pointer",letterSpacing:1}}>↺ NEW SESSION</button>}
        </div>
      </header>

      {/* Member status */}
      {isActive&&<MemberRow phase={phase} generatingFor={genFor} reviewingFor={revFor} doneGen={doneGen} doneRev={doneRev}/>}

      {/* Content */}
      <main style={{flex:1,position:"relative",zIndex:1,maxWidth:1100,margin:"0 auto",width:"100%",padding:"28px 24px"}}>
        {error&&(
          <div style={{padding:"12px 16px",marginBottom:16,background:"rgba(240,90,90,0.1)",border:"1px solid rgba(240,90,90,0.3)",borderRadius:8,fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:S.danger}}>
            ✕ {error} <button onClick={reset}style={{marginLeft:10,background:"none",border:"none",color:S.danger,cursor:"pointer",textDecoration:"underline",fontFamily:"'IBM Plex Mono',monospace",fontSize:11}}>Reset</button>
          </div>
        )}

        {isIdle&&(
          <div className="slide-up">
            <div style={{textAlign:"center",marginBottom:32}}>
              <div className="display"style={{fontSize:48,color:S.text,lineHeight:1,letterSpacing:4}}>COUNCIL OF LLMs</div>
              <div className="mono"style={{fontSize:10,color:S.textMut,letterSpacing:3,marginTop:8}}>BLIND PEER REVIEW · ANONYMOUS VOTING · COMPOSITE SCORING</div>
              <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:14,flexWrap:"wrap"}}>
                {["🛡️ Injection Guard","🔀 Crypto Shuffle","🚫 Identity Redaction","⚖️ Bias Detection","📐 Composite Scoring","🌡️ Varied Temperatures"].map(b=>(
                  <Chip key={b}>{b}</Chip>
                ))}
              </div>
            </div>
            <div style={{background:S.surface,border:`1px solid ${S.borderSoft}`,borderRadius:12,overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",padding:"10px 16px",background:S.raised,borderBottom:`1px solid ${S.border}`}}>
                <span className="mono"style={{fontSize:9,color:S.textMut,letterSpacing:2}}>COUNCIL PROMPT</span>
                <span className="mono"style={{fontSize:9,color:promptVal.length>3800?S.warning:S.textMut}}>{(4000-promptVal.length).toLocaleString()} chars</span>
              </div>
              <textarea value={promptVal} onChange={e=>setPromptVal(e.target.value.slice(0,4000))}
                onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==="Enter"&&promptVal.trim().length>=10)runSession(promptVal);}}
                placeholder="Describe a problem, feature, or task for all 5 council members to solve independently..."
                style={{width:"100%",minHeight:110,padding:"14px 16px",background:"transparent",border:"none",outline:"none",color:S.text,fontFamily:"'DM Sans',sans-serif",fontSize:14,lineHeight:1.7,resize:"vertical"}}/>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:S.raised,borderTop:`1px solid ${S.border}`}}>
                <span className="mono"style={{fontSize:9,color:S.textMut}}>⌘↵ to submit</span>
                <button onClick={()=>runSession(promptVal)} disabled={promptVal.trim().length<10}
                  style={{padding:"8px 18px",background:promptVal.trim().length>=10?S.accent:S.overlay,border:"none",borderRadius:8,color:promptVal.trim().length>=10?S.void:S.textMut,fontFamily:"'Bebas Neue',sans-serif",fontSize:12,letterSpacing:2,cursor:promptVal.trim().length>=10?"pointer":"not-allowed",transition:"all .2s"}}>
                  CONVENE COUNCIL
                </button>
              </div>
            </div>
            {promptWarnings.length>0&&promptWarnings.map((w,i)=><div key={i} className="mono"style={{fontSize:10,color:S.warning,marginTop:6}}>⚠ {w}</div>)}
            <div style={{marginTop:16}}>
              <div className="mono"style={{fontSize:8,color:S.textMut,letterSpacing:2,marginBottom:8}}>EXAMPLE PROMPTS</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {EXAMPLES.map(ex=>(
                  <button key={ex} onClick={()=>setPromptVal(ex)}
                    style={{padding:"4px 10px",background:S.raised,border:`1px solid ${S.border}`,borderRadius:6,color:S.textSec,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,cursor:"pointer",transition:"all .15s"}}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {isActive&&<ActivityLog entries={log}/>}

        {isActive&&(showOutputs||showReviews||showVerdict)&&(
          <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:`1px solid ${S.border}`,paddingBottom:0}}>
            {TABS.map(t=>{
              if(t.id==="outputs"&&!showOutputs)return null;
              if(t.id==="reviews"&&!showReviews)return null;
              if(t.id==="verdict"&&!showVerdict)return null;
              const active=tab===t.id;
              return(
                <button key={t.id} onClick={()=>setTab(t.id)}
                  style={{padding:"9px 16px",background:"transparent",border:"none",borderBottom:`2px solid ${active?S.accent:"transparent"}`,color:active?S.accent:S.textMut,fontFamily:"'IBM Plex Mono',monospace",fontSize:9,letterSpacing:2,cursor:"pointer",transition:"all .2s",marginBottom:-1}}>
                  {t.icon} {t.label}{t.id==="reviews"&&reviews.length>0?` (${reviews.length})`:""}
                </button>
              );
            })}
          </div>
        )}

        {tab==="outputs"&&showOutputs&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(400px,1fr))",gap:14}}>
            {anonOutputs.map(o=>{
              const sc=scores.find(s=>s.label===o.label);
              const iW=breakdown?.winner?.label===o.label;
              const iWorst=breakdown?.weakest?.label===o.label;
              return(
                <OutputCard key={o.label} label={o.label} content={o.content} isWinner={iW}
                  revealedMemberId={phase===PHASES.RESULTS?sc?.memberId:null}
                  reviews={phase===PHASES.RESULTS?getRevScores(o.label):[]}
                  score={sc?.avgScore??null} votes={sc?.votes??0}/>
              );
            })}
          </div>
        )}

        {tab==="reviews"&&showReviews&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {reviews.map(r=><ReviewCard key={r.reviewerId} review={r}/>)}
          </div>
        )}

        {tab==="verdict"&&showVerdict&&(
          <VerdictScreen breakdown={breakdown} scores={scores} biasReport={biasReport}/>
        )}
      </main>
    </div>
  );
}
