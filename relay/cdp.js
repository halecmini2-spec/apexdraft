/* Drive the headless browser over the DevTools protocol: --dump-dom stopped
   returning anything, but the browser itself is fine. */
const WebSocket=require("ws");
const [,,url,exprFile,waitMs]=process.argv;
const expr=require("fs").readFileSync(exprFile,"utf8");
(async()=>{
  const list=await (await fetch("http://localhost:9222/json/list")).json();
  let page=list.find(t=>t.type==="page");
  if(!page){ page=await (await fetch("http://localhost:9222/json/new?about:blank")).json(); }
  const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false});
  await new Promise(r=>ws.on("open",r));
  let id=0; const waits=new Map();
  ws.on("message",d=>{ const m=JSON.parse(d);
    if(m.id&&waits.has(m.id)){ waits.get(m.id)(m); waits.delete(m.id); } });
  const send=(method,params)=>new Promise(res=>{ const i=++id;
    waits.set(i,res); ws.send(JSON.stringify({id:i,method,params:params||{}})); });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate",{url});
  await new Promise(r=>setTimeout(r,+(waitMs||6000)));
  const r=await send("Runtime.evaluate",{expression:expr,awaitPromise:true,returnByValue:true});
  const v=r.result&&r.result.result;
  if(r.result&&r.result.exceptionDetails)console.log("EXCEPTION",JSON.stringify(r.result.exceptionDetails.exception));
  console.log(typeof v?.value==="string"?v.value:JSON.stringify(v&&v.value,null,1));
  ws.close(); process.exit(0);
})().catch(e=>{console.error("cdp:",e.message);process.exit(1);});
