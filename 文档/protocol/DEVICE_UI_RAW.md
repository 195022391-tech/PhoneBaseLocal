# device.js UI raw

## cancelGesture @36921
```
PresentationRotation(e){if(![0,90,180,270].includes(e))throw new Error("屏幕布局方向无效");e!==this.presentationRotation&&(this.cancelGesture(),this.presentationRotation=e,this.refreshStatus())}updateFrame(e){this.pointer&&(!e||this.frame?.width!==e.width||this.frame?.height!==e.height||!ge(e,this.geometry))&&this.cancelGesture(),this.frame=e,!e&&this.socket&&this.cancelGesture(),this.refreshStatus()}refreshStatus(e){this.notifyInputScope(e),this.canvas.classList.toggle("touch-control",this.canPoint),this.onStatus({active:
```

## cancelGesture @37109
```
dateFrame(e){this.pointer&&(!e||this.frame?.width!==e.width||this.frame?.height!==e.height||!ge(e,this.geometry))&&this.cancelGesture(),this.frame=e,!e&&this.socket&&this.cancelGesture(),this.refreshStatus()}refreshStatus(e){this.notifyInputScope(e),this.canvas.classList.toggle("touch-control",this.canPoint),this.onStatus({active:this.active,ready:this.ready,canPoint:this.canPoint,homeSupported:this.homeSupported,canHome:this.canHome,canText:this.canText,canKey:this.canKey,textAvailable:this.textAvailable,keyboardA
```

## command( @42117
```
.seq);return i&&(i.sent=null),u.send(JSON.stringify(e)),i&&(i.sent=!0),!0}catch{return this.recover("控制发送失败，已释放触控"),!1}}command(e,t){if(!this.ready||!this.socket)return!1;if(this.seq>=Number.MAX_SAFE_INTEGER)return this.stop("控制序号已耗尽，请重新连接"),!1;let u={type:"pointer",action:e,seq:++this.seq};if(e!=="cancel"){if(!this.canPoint||!t)return!1;Object.assign(u,t,{geometryRevision:this.geometry.revision,frameTimestampUs:this.frame.timestampUs})}return this.send(u,!0)}home(){return this.canHome?(this.inputEpoch++,this.notif
```

## command( @44163
```
anvas.setPointerCapture(e.pointerId)}catch{this.cancelGesture(),this.refreshStatus("浏览器无法跟踪本次指针，请重新点击");return}if(!this.command("down",t)){this.cancelGesture();return}this.feedback.show(e),this.lastMoveAt=performance.now(),e.preventDefault()}}moving(e){if(this.pointer?.id!==e.pointerId)return;if(!this.canPoint){this.cancelGesture();return}let t=this.point(e,!0);if(!t)return;this.feedback.show(e),this.move=t;let u=qe-(performance.now()-this.lastMoveAt);u<=0?this.flushMove():this.moveTimer||(this.moveTimer=setTimeout
```

## canPoint @36009
```
ehide",this.onPageHide),document.addEventListener("visibilitychange",this.onHidden)}get active(){return this.wanted}get canPoint(){return this.ready&&ge(this.frame,this.geometry)}get homeSupported(){return this.homeAvailable}get canText(){return this.ready&&this.active&&this.canPoint&&this.textAvailable}get canKey(){return this.ready&&this.active&&this.canPoint&&this.keyboardAvailable}get canHome(){return this.ready&&this.active&&this.homeSupported}get inputScope(){return[this.inputEpoch,this.active,this.ready,this
```

## canPoint @36165
```
s.frame,this.geometry)}get homeSupported(){return this.homeAvailable}get canText(){return this.ready&&this.active&&this.canPoint&&this.textAvailable}get canKey(){return this.ready&&this.active&&this.canPoint&&this.keyboardAvailable}get canHome(){return this.ready&&this.active&&this.homeSupported}get inputScope(){return[this.inputEpoch,this.active,this.ready,this.presentationRotation,this.geometry?.revision,this.frame?.width,this.frame?.height,this.canPoint].join(":")}subscribeInputScope(e){return this.inputScopeLis
```

## presentationRotation @34564
```
0,this.phoneDeviceId=null,this.onStatus=u,this.onMetrics=i,![0,90,180,270].includes(s))throw new Error("屏幕布局方向无效");this.presentationRotation=s,this.socket=null,this.wanted=!1,this.disposed=!1,this.focused=typeof document.hasFocus!="function"||document.hasFocus(),this.suspended=!1,this.retryTimer=null,this.stableTimer=null,this.retryCount=0,this.connectionMessage=null,this.geometry=null,this.frame=null,this.ready=!1,this.homeAvailable=!1,this.textAvailable=!1,this.keyboardAvailable=!1,this.pointer=null,this.seq=0,th
```

## presentationRotation @36410
```
{return this.ready&&this.active&&this.homeSupported}get inputScope(){return[this.inputEpoch,this.active,this.ready,this.presentationRotation,this.geometry?.revision,this.frame?.width,this.frame?.height,this.canPoint].join(":")}subscribeInputScope(e){return this.inputScopeListeners.add(e),()=>this.inputScopeListeners.delete(e)}notifyInputScope(e="控制连接、方向或画面已变化，未发送输入已取消"){let t=this.inputScope;if(t!==this.lastInputScope){this.lastInputScope=t;for(let u of[...this.inputScopeListeners])try{u(e)}catch{}}}updatePresentat
```

## pointerdown @10337
```
ull,this.unsubscribeScope=null,this.blockedScope=null,this.noticeVersion=0,this.nextOrder=0,e.tabIndex=0,this.listen(e,"pointerdown",a=>{a.button===0&&this.getController()?.canText&&t?.focus({preventScroll:!0})});for(let a of[e,t].filter(Boolean))this.listen(a,"keydown",o=>this.keydown(o)),this.listen(a,"paste",o=>this.paste(o)),this.listen(a,"beforeinput",o=>this.beforeinput(o)),this.listen(a,"compositionstart",()=>{let o=this.observeController();this.composing=!0,this.composition={control:o,scope:this.scope(o),in
```

## pointerdown @35290
```
,this.moveTimer=null,this.lastMoveAt=-1/0,this.keepalive=null,this.readyTimer=null,this.rejectStart=null,this.handlers={pointerdown:n=>this.down(n),pointermove:n=>this.moving(n),pointerup:n=>this.up(n),pointercancel:n=>this.lostPointer(n),lostpointercapture:n=>this.lostPointer(n)};for(let[n,a]of Object.entries(this.handlers))e.addEventListener(n,a);this.onBlur=()=>{this.focused=!1,this.suspend("窗口失去焦点，控制已暂停；返回窗口后自动恢复")},this.onFocus=()=>{this.focused=!0,this.resume()},this.onHidden=()=>{document.hidden?this.suspend
```

## phonebase-device-rotate @81791
```
entation:e=>{M=e,Ce();let t=e.displayWidth,u=e.displayHeight,i=[e.mode,e.rotation,t,u].join(":");i!==Ze&&(Ze=i,L({type:"phonebase-device-rotate",mode:e.mode,width:t,height:u,rotation:e.rotation}))}});G=_e({container:H,canvas:D,toggleButton:d("toggle-text-input"),getController:()=>f.control,onStatus:e=>{f.status=e,f.emit()}}),G&&H.lastElementChild?.classList.add("device-keyboard-tools");var it=new ResizeObserver(Ce);it.observe(U),d("control-toggle").addEventListener("click",()=>{f.toggleControl()}),d("home-device").
```

## chrome.webview @78315
```
baseDeviceWindow===!0&&!!globalThis.chrome?.webview,O=new URLSearchParams(location.search).get("rental")==="1",L=e=>{C&&chrome.webview.postMessage(e)},H=d("device-window"),U=d("screen"),D=d("device-canvas");Je({root:H,header:document.querySelector(".device-header"),dialog:d("details-dialog"),nativeWindow:C,rentalWindow:O});var N;try{N=localStorage}catch{}var Xe=new ie({root:document.querySelector(".video-settings"),storage:N}),q=!1,Ie=null,Pe=0,M={mode:"portrait",rotation:0,width:750,height:1334},Ze="",Ye="",et=0,j
```

## postMessage @1775
```
w()};for(let u of["networkRequestMs","clickAckMs"])Object.hasOwn(e,u)&&(t[u]=le(e[u]));this.accept(t);try{this.channel?.postMessage(t)}catch{}}get(e,t){let u=this.records.get(e),i={networkRequestMs:null,clickAckMs:null};if(!u||t&&u.rentalLeaseId!==t)return i;for(let s of Object.keys(i))this.now()-u[s+"At"]<=3e4&&(i[s]=le(u[s]));return i}dispose(){this.setAccount(null)}},ct={P2P_RECONNECTING:"正在重新连接设备",P2P_RELAY_CONNECTED:"画面已连接",P2P_RELAY_UNAVAILABLE:"设备连接暂不可用，请稍后重试",P2P_RELAY_NOT_AUTHORIZED:"连接授权已变化，请重新打开设备",P2P_R
```

## postMessage @78330
```
w===!0&&!!globalThis.chrome?.webview,O=new URLSearchParams(location.search).get("rental")==="1",L=e=>{C&&chrome.webview.postMessage(e)},H=d("device-window"),U=d("screen"),D=d("device-canvas");Je({root:H,header:document.querySelector(".device-header"),dialog:d("details-dialog"),nativeWindow:C,rentalWindow:O});var N;try{N=localStorage}catch{}var Xe=new ie({root:document.querySelector(".video-settings"),storage:N}),q=!1,Ie=null,Pe=0,M={mode:"portrait",rotation:0,width:750,height:1334},Ze="",Ye="",et=0,j=!1,V=new Map,A
```

## frameTimestampUs @42396
```
:++this.seq};if(e!=="cancel"){if(!this.canPoint||!t)return!1;Object.assign(u,t,{geometryRevision:this.geometry.revision,frameTimestampUs:this.frame.timestampUs})}return this.send(u,!0)}home(){return this.canHome?(this.inputEpoch++,this.notifyInputScope("Home 已改变手机输入位置，未发送输入已取消"),this.cancelGesture(),this.seq>=Number.MAX_SAFE_INTEGER?(this.stop("控制序号已耗尽，请重新连接"),!1):this.send({type:"button",button:"home",seq:++this.seq},!0)):!1}text(e){try{e=pe(e)}catch(t){return Promise.reject(R(t))}return this.inputCommand("text",{
```

## geometryRevision @42356
```
"),!1;let u={type:"pointer",action:e,seq:++this.seq};if(e!=="cancel"){if(!this.canPoint||!t)return!1;Object.assign(u,t,{geometryRevision:this.geometry.revision,frameTimestampUs:this.frame.timestampUs})}return this.send(u,!0)}home(){return this.canHome?(this.inputEpoch++,this.notifyInputScope("Home 已改变手机输入位置，未发送输入已取消"),this.cancelGesture(),this.seq>=Number.MAX_SAFE_INTEGER?(this.stop("控制序号已耗尽，请重新连接"),!1):this.send({type:"button",button:"home",seq:++this.seq},!0)):!1}text(e){try{e=pe(e)}catch(t){return Promise.reject
```

## clientX @33150
```
n===270?{x:1-v,y:g}:{x:g,y:v}}var X=class{constructor(){this.node=null,this.timer=null}show(e){if(!(!Number.isFinite(e?.clientX)||!Number.isFinite(e?.clientY)||!globalThis.document?.body?.append||!document.createElement)){if(clearTimeout(this.timer),this.timer=null,!this.node){let t=document.createElement("span");if(!t.style)return;t.className="phone-touch-point",t.setAttribute("aria-hidden","true"),document.body.append(t),this.node=t}this.node.hidden=!1,this.node.style.opacity="1",this.node.style.left=e.clientX+"p
```

## clientX @33540
```
den","true"),document.body.append(t),this.node=t}this.node.hidden=!1,this.node.style.opacity="1",this.node.style.left=e.clientX+"px",this.node.style.top=e.clientY+"px"}}end(){this.node&&(this.node.style.opacity="0",clearTimeout(this.timer),this.timer=setTimeout(()=>{this.node&&(this.node.hidden=!0),this.timer=null},180))}clear(){clearTimeout(this.timer),this.timer=null,this.node&&(this.node.hidden=!0)}dispose(){this.clear(),this.node?.remove(),this.node=null}},Oe=16*1024,qe=1e3/30,Fe=128,ye=[300,700,1500,3e3,5e3],w
```

## getBoundingClientRect @43721
```
ndingInputs.delete(i.seq),n.reject(new Error("输入未发送，连接恢复后请手动重试")))}))}point(e,t=!1){return this.canPoint?De(this.canvas.getBoundingClientRect(),this.frame.width,this.frame.height,e.clientX,e.clientY,t,this.presentationRotation):null}down(e){if(!this.canPoint||this.pointer||e.button!==0||e.isPrimary===!1)return;let t=this.point(e);if(t){this.inputEpoch++,this.notifyInputScope("手机输入位置已重新点选，未发送输入已取消"),this.pointer={id:e.pointerId};try{this.canvas.setPointerCapture(e.pointerId)}catch{this.cancelGesture(),this.refreshSt
```

## getBoundingClientRect @74627
```
abled||!this.items.length)return;this.menu.hidden=!1,this.button.setAttribute("aria-expanded","true");let t=this.button.getBoundingClientRect(),u=this.menu.offsetWidth||148,i=this.menu.offsetHeight||78,s=this.document.documentElement.clientWidth,r=this.document.documentElement.clientHeight,n=this.placement==="left"?t.left-u-7:t.left,a=this.placement==="left"?t.top:t.bottom+6;this.menu.style.left=Math.max(8,Math.min(n,s-u-8))+"px",this.menu.style.top=Math.max(8,Math.min(a,r-i-8))+"px",this.document.addEventListener(
```
