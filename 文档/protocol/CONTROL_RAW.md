
# SOURCE device len=85808

## phonebase-control count=1
### @39030
```
f(this.ready&&Object.hasOwn(r,"deviceId")&&r.deviceId!==this.phoneDeviceId)throw new Error("手机控制会话已变化，请重新开启控制");if(r.type==="ready"){let n=Object.hasOwn(r,"recordId")?r.recordId===this.deviceId:r.deviceId===this.deviceId;if(this.ready||r.protocol!=="phonebase-control"||r.version!==1||!n||!It(r.deviceId)||r.controlAvailable!==!0||!Y(r.geometry))throw new Error("手机不支持当前控制协议，请更新基座 IPA");this.phoneDeviceId=r.deviceId,this.geometry={...r.geometry},this.homeAvailable=r.homeAvailable===!0,this.textAvai
```

## type:"button" count=1
### @42654
```
estampUs:this.frame.timestampUs})}return this.send(u,!0)}home(){return this.canHome?(this.inputEpoch++,this.notifyInputScope("Home 已改变手机输入位置，未发送输入已取消"),this.cancelGesture(),this.seq>=Number.MAX_SAFE_INTEGER?(this.stop("控制序号已耗尽，请重新连接"),!1):this.send({type:"button",button:"home",seq:++this.seq},!0)):!1}text(e){try{e=pe(e)}catch(t){return Promise.reject(R(t))}return this.inputCommand("text",{text:e})}key(e){return ue.includes(e)?this.inputCommand("key",{key:e}):Promise.reject(R("不支持的手机按键"))}inputCo
```

## type:"text" count=1
### @10985
```
invalidated:!1}}),this.listen(a,"compositionend",o=>{let h=this.composition;this.composing=!1,this.composition=null;let l=this.observeController();o.data&&(!h||h.invalidated||l!==h.control||this.scope(l)!==h.scope?(this.noticeVersion++,this.retain([{type:"text",value:o.data}],"输入法期间控制范围已变化"),this.onStatus("输入法期间控制范围已变化；本次文字已保留草稿，未发送。")):this.send("text",o.data)),t&&(t.value="")}),this.listen(a,"input",()=>{!this.composing&&t&&(t.value="")});globalThis.window?.addEventListener&&this.listen(window
```

## type:"keepalive" count=1
### @39702
```
.rejectStart=null,this.stableTimer=setTimeout(()=>{this.socket===t&&this.ready&&(this.retryCount=0)},1e4),this.keepalive=setInterval(()=>{if([...this.pendingAcks.values()].some(a=>performance.now()-a>3e3)){this.recover("手机未确认触控指令");return}this.send({type:"keepalive"})},500),this.refreshStatus(),u()}else if(r.type==="geometry"){if(!this.ready||!Y(r.geometry)||r.geometry.revision<=this.geometry.revision)throw new Error("手机返回了无效的屏幕方向信息");this.cancelGesture(),this.geometry={...r.geometry},this.refre
```

## geometry count=17
### @34819
```
ntationRotation=s,this.socket=null,this.wanted=!1,this.disposed=!1,this.focused=typeof document.hasFocus!="function"||document.hasFocus(),this.suspended=!1,this.retryTimer=null,this.stableTimer=null,this.retryCount=0,this.connectionMessage=null,this.geometry=null,this.frame=null,this.ready=!1,this.homeAvailable=!1,this.textAvailable=!1,this.keyboardAvailable=!1,this.pointer=null,this.seq=0,this.pendingAcks=new Map,this.pendingInputs=new Map,this.inputEpoch=0,this.inputScopeListeners=new Set,this
```
### @36058
```
nBlur),window.addEventListener("focus",this.onFocus),window.addEventListener("pagehide",this.onPageHide),document.addEventListener("visibilitychange",this.onHidden)}get active(){return this.wanted}get canPoint(){return this.ready&&ge(this.frame,this.geometry)}get homeSupported(){return this.homeAvailable}get canText(){return this.ready&&this.active&&this.canPoint&&this.textAvailable}get canKey(){return this.ready&&this.active&&this.canPoint&&this.keyboardAvailable}get canHome(){return this.ready
```
### @36436
```
ailable}get canKey(){return this.ready&&this.active&&this.canPoint&&this.keyboardAvailable}get canHome(){return this.ready&&this.active&&this.homeSupported}get inputScope(){return[this.inputEpoch,this.active,this.ready,this.presentationRotation,this.geometry?.revision,this.frame?.width,this.frame?.height,this.canPoint].join(":")}subscribeInputScope(e){return this.inputScopeListeners.add(e),()=>this.inputScopeListeners.delete(e)}notifyInputScope(e="控制连接、方向或画面已变化，未发送输入已取消"){let t=this.inputScope;i
```

## seq: count=7
### @14438
```
(),t&&this.send("text",t)}send(e,t,{coalesce:u=!1,draft:i=!1}={}){if(this.disposed)return Promise.resolve(!1);try{if(e==="text")t=pe(t);else if(e!=="key"||!ue.includes(t))throw new Error("不支持的手机按键");if(new TextEncoder().encode(JSON.stringify({type:e,seq:Number.MAX_SAFE_INTEGER,...e==="text"?{text:t}:{key:t}})).length>8192)throw new Error("输入指令超过 8192 字节，请缩短文本");let s=this.observeController();if(this.blocked)return this.retain([{type:e,value:t,draft:i}],"请先停止控制并核对草稿后重新开始"),this.noticeVersion++,th
```
### @15426
```
:new Promise(a=>{let o=this.queue.at(-1);e==="text"&&u&&o?.coalesce&&o.type==="text"&&o.control===s&&o.scope===n&&o.noticeVersion===this.noticeVersion&&new TextEncoder().encode(o.value+t).length<=4096&&new TextEncoder().encode(JSON.stringify({type:e,seq:Number.MAX_SAFE_INTEGER,text:o.value+t})).length<=8192?(o.value+=t,o.bytes+=r,o.waiters.push(a)):this.queue.push({type:e,value:t,control:s,scope:n,bytes:r,coalesce:u,draft:i,order:++this.nextOrder,noticeVersion:this.noticeVersion,waiters:[a],sett
```
### @40343
```
.get(r.seq),a=St.get(r.code);if(!r.ok&&a&&this.ready){if(n!==void 0){this.rejectProtectedInput(r.code,a);return}if(this.policyCancelledAcks.has(r.seq))return}let o=this.pendingInputs.get(r.seq);if(this.pendingInputs.delete(r.seq),o&&(r.ok?o.resolve({seq:r.seq,ok:!0}):o.reject(new Error(r.error||"手机拒绝了输入指令"))),this.pendingAcks.delete(r.seq),!r.ok&&n!==void 0&&!Object.hasOwn(r,"code")&&Et.has(r.error)){this.recover("手机已释放本次操作，正在恢复控制");return}if(!r.ok)throw new Error(r.error||"手机拒绝了触控指令");if(n!==vo
```

## home count=19
### @34868
```
,this.disposed=!1,this.focused=typeof document.hasFocus!="function"||document.hasFocus(),this.suspended=!1,this.retryTimer=null,this.stableTimer=null,this.retryCount=0,this.connectionMessage=null,this.geometry=null,this.frame=null,this.ready=!1,this.homeAvailable=!1,this.textAvailable=!1,this.keyboardAvailable=!1,this.pointer=null,this.seq=0,this.pendingAcks=new Map,this.pendingInputs=new Map,this.inputEpoch=0,this.inputScopeListeners=new Set,this.lastInputScope=null,this.policyCancelledAcks=new
```
### @36072
```
addEventListener("focus",this.onFocus),window.addEventListener("pagehide",this.onPageHide),document.addEventListener("visibilitychange",this.onHidden)}get active(){return this.wanted}get canPoint(){return this.ready&&ge(this.frame,this.geometry)}get homeSupported(){return this.homeAvailable}get canText(){return this.ready&&this.active&&this.canPoint&&this.textAvailable}get canKey(){return this.ready&&this.active&&this.canPoint&&this.keyboardAvailable}get canHome(){return this.ready&&this.active&
```
### @36100
```
s.onFocus),window.addEventListener("pagehide",this.onPageHide),document.addEventListener("visibilitychange",this.onHidden)}get active(){return this.wanted}get canPoint(){return this.ready&&ge(this.frame,this.geometry)}get homeSupported(){return this.homeAvailable}get canText(){return this.ready&&this.active&&this.canPoint&&this.textAvailable}get canKey(){return this.ready&&this.active&&this.canPoint&&this.keyboardAvailable}get canHome(){return this.ready&&this.active&&this.homeSupported}get inpu
```

## pointerdown count=4
### @10337
```
1,this.composing=!1,this.listeners=[],this.queue=[],this.queuedBytes=0,this.inFlight=null,this.boundControl=null,this.boundScope=null,this.unsubscribeScope=null,this.blockedScope=null,this.noticeVersion=0,this.nextOrder=0,e.tabIndex=0,this.listen(e,"pointerdown",a=>{a.button===0&&this.getController()?.canText&&t?.focus({preventScroll:!0})});for(let a of[e,t].filter(Boolean))this.listen(a,"keydown",o=>this.keydown(o)),this.listen(a,"paste",o=>this.paste(o)),this.listen(a,"beforeinput",o=>this.bef
```
### @35290
```
utScopeListeners=new Set,this.lastInputScope=null,this.policyCancelledAcks=new Set,this.policyCancellationCode=null,this.move=null,this.moveTimer=null,this.lastMoveAt=-1/0,this.keepalive=null,this.readyTimer=null,this.rejectStart=null,this.handlers={pointerdown:n=>this.down(n),pointermove:n=>this.moving(n),pointerup:n=>this.up(n),pointercancel:n=>this.lostPointer(n),lostpointercapture:n=>this.lostPointer(n)};for(let[n,a]of Object.entries(this.handlers))e.addEventListener(n,a);this.onBlur=()=>{th
```
### @75028
```
lement.clientHeight,n=this.placement==="left"?t.left-u-7:t.left,a=this.placement==="left"?t.top:t.bottom+6;this.menu.style.left=Math.max(8,Math.min(n,s-u-8))+"px",this.menu.style.top=Math.max(8,Math.min(a,r-i-8))+"px",this.document.addEventListener("pointerdown",this.outside,!0),this.items[e]?.focus()}close(e=!1){this.menu.hidden=!0,this.button.setAttribute("aria-expanded","false"),this.document.removeEventListener?.("pointerdown",this.outside,!0),e&&this.button.focus()}dispose(){this.close(),th
```

## pointermove count=1
### @35318
```
s.lastInputScope=null,this.policyCancelledAcks=new Set,this.policyCancellationCode=null,this.move=null,this.moveTimer=null,this.lastMoveAt=-1/0,this.keepalive=null,this.readyTimer=null,this.rejectStart=null,this.handlers={pointerdown:n=>this.down(n),pointermove:n=>this.moving(n),pointerup:n=>this.up(n),pointercancel:n=>this.lostPointer(n),lostpointercapture:n=>this.lostPointer(n)};for(let[n,a]of Object.entries(this.handlers))e.addEventListener(n,a);this.onBlur=()=>{this.focused=!1,this.suspend("
```

## pointerup count=1
### @35348
```
icyCancelledAcks=new Set,this.policyCancellationCode=null,this.move=null,this.moveTimer=null,this.lastMoveAt=-1/0,this.keepalive=null,this.readyTimer=null,this.rejectStart=null,this.handlers={pointerdown:n=>this.down(n),pointermove:n=>this.moving(n),pointerup:n=>this.up(n),pointercancel:n=>this.lostPointer(n),lostpointercapture:n=>this.lostPointer(n)};for(let[n,a]of Object.entries(this.handlers))e.addEventListener(n,a);this.onBlur=()=>{this.focused=!1,this.suspend("窗口失去焦点，控制已暂停；返回窗口后自动恢复")},this
```

## keydown count=7
### @10479
```
ubscribeScope=null,this.blockedScope=null,this.noticeVersion=0,this.nextOrder=0,e.tabIndex=0,this.listen(e,"pointerdown",a=>{a.button===0&&this.getController()?.canText&&t?.focus({preventScroll:!0})});for(let a of[e,t].filter(Boolean))this.listen(a,"keydown",o=>this.keydown(o)),this.listen(a,"paste",o=>this.paste(o)),this.listen(a,"beforeinput",o=>this.beforeinput(o)),this.listen(a,"compositionstart",()=>{let o=this.observeController();this.composing=!0,this.composition={control:o,scope:this.sco
```
### @10496
```
l,this.blockedScope=null,this.noticeVersion=0,this.nextOrder=0,e.tabIndex=0,this.listen(e,"pointerdown",a=>{a.button===0&&this.getController()?.canText&&t?.focus({preventScroll:!0})});for(let a of[e,t].filter(Boolean))this.listen(a,"keydown",o=>this.keydown(o)),this.listen(a,"paste",o=>this.paste(o)),this.listen(a,"beforeinput",o=>this.beforeinput(o)),this.listen(a,"compositionstart",()=>{let o=this.observeController();this.composing=!0,this.composition={control:o,scope:this.scope(o),invalidated
```
### @13376
```
ession:this.boundControl?.inputSession}),this.noticeVersion++,r&&!this.disposed&&this.onStatus(e+(i.length||t.length?"；未发送文本已保留草稿，按键已取消。":"")+(s&&!s.notSent?" 已提交部分请先核对手机，不会重发。":""))}listen(e,t,u){e.addEventListener(t,u),this.listeners.push([e,t,u])}keydown(e){if(this.disposed||e.isComposing||this.composing||e.keyCode===229||e.ctrlKey||e.metaKey||e.altKey)return;let t=ut[e.key];t?(e.preventDefault(),this.send("key",t)):e.currentTarget===this.canvas&&[...e.key||""].length===1&&(e.preventDefault()
```

## /control/ count=1
### @38312
```
is.textAvailable=!1,this.keyboardAvailable=!1,this.phoneDeviceId=null,this.seq=0,this.pendingAcks.clear(),this.policyCancelledAcks.clear(),this.policyCancellationCode=null,this.onMetrics({controlRttMs:null});let e=new URL(`${this.rental?"/rental":""}/control/${encodeURIComponent(this.deviceId)}`,location.href);e.protocol=location.protocol==="https:"?"wss:":"ws:";let t;try{t=new WebSocket(e)}catch(u){return this.recover("手机控制连接失败"),Promise.reject(u)}return this.socket=t,this.refreshStatus(),new P
```

# SOURCE app len=291838

## phonebase-control count=1
### @174841
```
f(this.ready&&Object.hasOwn(r,"deviceId")&&r.deviceId!==this.phoneDeviceId)throw new Error("手机控制会话已变化，请重新开启控制");if(r.type==="ready"){let a=Object.hasOwn(r,"recordId")?r.recordId===this.deviceId:r.deviceId===this.deviceId;if(this.ready||r.protocol!=="phonebase-control"||r.version!==1||!a||!ja(r.deviceId)||r.controlAvailable!==!0||!Qt(r.geometry))throw new Error("手机不支持当前控制协议，请更新基座 IPA");this.phoneDeviceId=r.deviceId,this.geometry={...r.geometry},this.homeAvailable=r.homeAvailable===!0,this.textAva
```

## type:"button" count=1
### @178467
```
estampUs:this.frame.timestampUs})}return this.send(i,!0)}home(){return this.canHome?(this.inputEpoch++,this.notifyInputScope("Home 已改变手机输入位置，未发送输入已取消"),this.cancelGesture(),this.seq>=Number.MAX_SAFE_INTEGER?(this.stop("控制序号已耗尽，请重新连接"),!1):this.send({type:"button",button:"home",seq:++this.seq},!0)):!1}text(e){try{e=ut(e)}catch(t){return Promise.reject(De(t))}return this.inputCommand("text",{text:e})}key(e){return ht.includes(e)?this.inputCommand("key",{key:e}):Promise.reject(De("不支持的手机按键"))}input
```

## type:"text" count=1
### @157418
```
invalidated:!1}}),this.listen(o,"compositionend",d=>{let c=this.composition;this.composing=!1,this.composition=null;let h=this.observeController();d.data&&(!c||c.invalidated||h!==c.control||this.scope(h)!==c.scope?(this.noticeVersion++,this.retain([{type:"text",value:d.data}],"输入法期间控制范围已变化"),this.onStatus("输入法期间控制范围已变化；本次文字已保留草稿，未发送。")):this.send("text",d.data)),t&&(t.value="")}),this.listen(o,"input",()=>{!this.composing&&t&&(t.value="")});globalThis.window?.addEventListener&&this.listen(window
```

## type:"keepalive" count=1
### @175514
```
.rejectStart=null,this.stableTimer=setTimeout(()=>{this.socket===t&&this.ready&&(this.retryCount=0)},1e4),this.keepalive=setInterval(()=>{if([...this.pendingAcks.values()].some(o=>performance.now()-o>3e3)){this.recover("手机未确认触控指令");return}this.send({type:"keepalive"})},500),this.refreshStatus(),i()}else if(r.type==="geometry"){if(!this.ready||!Qt(r.geometry)||r.geometry.revision<=this.geometry.revision)throw new Error("手机返回了无效的屏幕方向信息");this.cancelGesture(),this.geometry={...r.geometry},this.refr
```

## geometry count=19
### @170630
```
ntationRotation=n,this.socket=null,this.wanted=!1,this.disposed=!1,this.focused=typeof document.hasFocus!="function"||document.hasFocus(),this.suspended=!1,this.retryTimer=null,this.stableTimer=null,this.retryCount=0,this.connectionMessage=null,this.geometry=null,this.frame=null,this.ready=!1,this.homeAvailable=!1,this.textAvailable=!1,this.keyboardAvailable=!1,this.pointer=null,this.seq=0,this.pendingAcks=new Map,this.pendingInputs=new Map,this.inputEpoch=0,this.inputScopeListeners=new Set,this
```
### @171869
```
nBlur),window.addEventListener("focus",this.onFocus),window.addEventListener("pagehide",this.onPageHide),document.addEventListener("visibilitychange",this.onHidden)}get active(){return this.wanted}get canPoint(){return this.ready&&ni(this.frame,this.geometry)}get homeSupported(){return this.homeAvailable}get canText(){return this.ready&&this.active&&this.canPoint&&this.textAvailable}get canKey(){return this.ready&&this.active&&this.canPoint&&this.keyboardAvailable}get canHome(){return this.ready
```
### @172247
```
ailable}get canKey(){return this.ready&&this.active&&this.canPoint&&this.keyboardAvailable}get canHome(){return this.ready&&this.active&&this.homeSupported}get inputScope(){return[this.inputEpoch,this.active,this.ready,this.presentationRotation,this.geometry?.revision,this.frame?.width,this.frame?.height,this.canPoint].join(":")}subscribeInputScope(e){return this.inputScopeListeners.add(e),()=>this.inputScopeListeners.delete(e)}notifyInputScope(e="控制连接、方向或画面已变化，未发送输入已取消"){let t=this.inputScope;i
```

## seq: count=7
### @160871
```
(),t&&this.send("text",t)}send(e,t,{coalesce:i=!1,draft:s=!1}={}){if(this.disposed)return Promise.resolve(!1);try{if(e==="text")t=ut(t);else if(e!=="key"||!ht.includes(t))throw new Error("不支持的手机按键");if(new TextEncoder().encode(JSON.stringify({type:e,seq:Number.MAX_SAFE_INTEGER,...e==="text"?{text:t}:{key:t}})).length>8192)throw new Error("输入指令超过 8192 字节，请缩短文本");let n=this.observeController();if(this.blocked)return this.retain([{type:e,value:t,draft:s}],"请先停止控制并核对草稿后重新开始"),this.noticeVersion++,th
```
### @161859
```
:new Promise(o=>{let d=this.queue.at(-1);e==="text"&&i&&d?.coalesce&&d.type==="text"&&d.control===n&&d.scope===a&&d.noticeVersion===this.noticeVersion&&new TextEncoder().encode(d.value+t).length<=4096&&new TextEncoder().encode(JSON.stringify({type:e,seq:Number.MAX_SAFE_INTEGER,text:d.value+t})).length<=8192?(d.value+=t,d.bytes+=r,d.waiters.push(o)):this.queue.push({type:e,value:t,control:n,scope:a,bytes:r,coalesce:i,draft:s,order:++this.nextOrder,noticeVersion:this.noticeVersion,waiters:[o],sett
```
### @176156
```
.get(r.seq),o=Ua.get(r.code);if(!r.ok&&o&&this.ready){if(a!==void 0){this.rejectProtectedInput(r.code,o);return}if(this.policyCancelledAcks.has(r.seq))return}let d=this.pendingInputs.get(r.seq);if(this.pendingInputs.delete(r.seq),d&&(r.ok?d.resolve({seq:r.seq,ok:!0}):d.reject(new Error(r.error||"手机拒绝了输入指令"))),this.pendingAcks.delete(r.seq),!r.ok&&a!==void 0&&!Object.hasOwn(r,"code")&&Ba.has(r.error)){this.recover("手机已释放本次操作，正在恢复控制");return}if(!r.ok)throw new Error(r.error||"手机拒绝了触控指令");if(a!==vo
```

## home count=35
### @46934
```
.assign(this,{getMetrics:n,business:s,openWallet:r,openDemands:a,onRented:o}),this.canConfigurePhone=i,this.listingMenu=f("rental-listing-menu"),this.available=!1,this.disposed=!1,this.authenticated=!1,this.account=null,this.snapshot=null,this.view="home",this.loading=!1,this.busy=!1,this.epoch=0,this.timer=null,this.controller=null,this.editing=null,this.detail=null,this.rentAttempt=null,this.redeemAttempt=null,this.withdrawing=null,this.pages={catalog:1,myListings:1,orders:1,ledger:1,ownedDevi
```
### @48254
```
est?.(".rental-offer-menu")&&this.closeListingMenu()}),f("rental-dialog").addEventListener("close",()=>this.closed()),f("rental-back").addEventListener("click",()=>this.show(this.view==="editor"||this.withdrawing?"offer":this.view==="detail"?"rent":"home"));for(let[b,w]of[["rental-rent-entry","rent"],["rental-offer-entry","offer"],["rental-orders-entry","orders"],["rental-wallet-entry","wallet"]])f(b).addEventListener("click",()=>{w==="wallet"&&this.openWallet?(this.close(),this.openWallet()):th
```
### @54020
```
ading=!1,this.controller=null,this.render())}}setAccount(e){let t=e?.id||null;t!==this.account?.id&&(this.close(),this.closed(),this.clearAccount()),this.account=e||null,this.authenticated=!!t,this.render()}show(e){!this.available||this.disposed||!["home","rent","offer","orders","wallet","editor","detail"].includes(e)||(this.preparation&&e!==this.view&&(this.preparation.controller.abort(),this.preparation=null,this.mutation=null,this.epoch++,this.busy=!1),this.view=e==="home"?"rent":e,this.withd
```

## pointerdown count=6
### @47916
```
)}),f("rental-listing-remove")?.addEventListener("click",()=>{let b=this.menuListing;this.closeListingMenu(),b?.status==="withdrawn"&&(this.detail=b,this.view="detail",this.withdrawing=b,this.removing=!0,this.render())}),document.addEventListener?.("pointerdown",b=>{let w=f("rental-listing-menu");w&&!w.contains(b.target)&&!b.target.closest?.(".rental-offer-menu")&&this.closeListingMenu()}),f("rental-dialog").addEventListener("close",()=>this.closed()),f("rental-back").addEventListener("click",()
```
### @156770
```
1,this.composing=!1,this.listeners=[],this.queue=[],this.queuedBytes=0,this.inFlight=null,this.boundControl=null,this.boundScope=null,this.unsubscribeScope=null,this.blockedScope=null,this.noticeVersion=0,this.nextOrder=0,e.tabIndex=0,this.listen(e,"pointerdown",o=>{o.button===0&&this.getController()?.canText&&t?.focus({preventScroll:!0})});for(let o of[e,t].filter(Boolean))this.listen(o,"keydown",d=>this.keydown(d)),this.listen(o,"paste",d=>this.paste(d)),this.listen(o,"beforeinput",d=>this.bef
```
### @171101
```
utScopeListeners=new Set,this.lastInputScope=null,this.policyCancelledAcks=new Set,this.policyCancellationCode=null,this.move=null,this.moveTimer=null,this.lastMoveAt=-1/0,this.keepalive=null,this.readyTimer=null,this.rejectStart=null,this.handlers={pointerdown:a=>this.down(a),pointermove:a=>this.moving(a),pointerup:a=>this.up(a),pointercancel:a=>this.lostPointer(a),lostpointercapture:a=>this.lostPointer(a)};for(let[a,o]of Object.entries(this.handlers))e.addEventListener(a,o);this.onBlur=()=>{th
```

## pointermove count=1
### @171129
```
s.lastInputScope=null,this.policyCancelledAcks=new Set,this.policyCancellationCode=null,this.move=null,this.moveTimer=null,this.lastMoveAt=-1/0,this.keepalive=null,this.readyTimer=null,this.rejectStart=null,this.handlers={pointerdown:a=>this.down(a),pointermove:a=>this.moving(a),pointerup:a=>this.up(a),pointercancel:a=>this.lostPointer(a),lostpointercapture:a=>this.lostPointer(a)};for(let[a,o]of Object.entries(this.handlers))e.addEventListener(a,o);this.onBlur=()=>{this.focused=!1,this.suspend("
```

## pointerup count=1
### @171159
```
icyCancelledAcks=new Set,this.policyCancellationCode=null,this.move=null,this.moveTimer=null,this.lastMoveAt=-1/0,this.keepalive=null,this.readyTimer=null,this.rejectStart=null,this.handlers={pointerdown:a=>this.down(a),pointermove:a=>this.moving(a),pointerup:a=>this.up(a),pointercancel:a=>this.lostPointer(a),lostpointercapture:a=>this.lostPointer(a)};for(let[a,o]of Object.entries(this.handlers))e.addEventListener(a,o);this.onBlur=()=>{this.focused=!1,this.suspend("窗口失去焦点，控制已暂停；返回窗口后自动恢复")},this
```

## keydown count=11
### @156912
```
ubscribeScope=null,this.blockedScope=null,this.noticeVersion=0,this.nextOrder=0,e.tabIndex=0,this.listen(e,"pointerdown",o=>{o.button===0&&this.getController()?.canText&&t?.focus({preventScroll:!0})});for(let o of[e,t].filter(Boolean))this.listen(o,"keydown",d=>this.keydown(d)),this.listen(o,"paste",d=>this.paste(d)),this.listen(o,"beforeinput",d=>this.beforeinput(d)),this.listen(o,"compositionstart",()=>{let d=this.observeController();this.composing=!0,this.composition={control:d,scope:this.sco
```
### @156929
```
l,this.blockedScope=null,this.noticeVersion=0,this.nextOrder=0,e.tabIndex=0,this.listen(e,"pointerdown",o=>{o.button===0&&this.getController()?.canText&&t?.focus({preventScroll:!0})});for(let o of[e,t].filter(Boolean))this.listen(o,"keydown",d=>this.keydown(d)),this.listen(o,"paste",d=>this.paste(d)),this.listen(o,"beforeinput",d=>this.beforeinput(d)),this.listen(o,"compositionstart",()=>{let d=this.observeController();this.composing=!0,this.composition={control:d,scope:this.scope(d),invalidated
```
### @159809
```
ession:this.boundControl?.inputSession}),this.noticeVersion++,r&&!this.disposed&&this.onStatus(e+(s.length||t.length?"；未发送文本已保留草稿，按键已取消。":"")+(n&&!n.notSent?" 已提交部分请先核对手机，不会重发。":""))}listen(e,t,i){e.addEventListener(t,i),this.listeners.push([e,t,i])}keydown(e){if(this.disposed||e.isComposing||this.composing||e.keyCode===229||e.ctrlKey||e.metaKey||e.altKey)return;let t=qa[e.key];t?(e.preventDefault(),this.send("key",t)):e.currentTarget===this.canvas&&[...e.key||""].length===1&&(e.preventDefault()
```

## /control/ count=1
### @174123
```
is.textAvailable=!1,this.keyboardAvailable=!1,this.phoneDeviceId=null,this.seq=0,this.pendingAcks.clear(),this.policyCancelledAcks.clear(),this.policyCancellationCode=null,this.onMetrics({controlRttMs:null});let e=new URL(`${this.rental?"/rental":""}/control/${encodeURIComponent(this.deviceId)}`,location.href);e.protocol=location.protocol==="https:"?"wss:":"ws:";let t;try{t=new WebSocket(e)}catch(i){return this.recover("手机控制连接失败"),Promise.reject(i)}return this.socket=t,this.refreshStatus(),new P
```

# SOURCE entry len=1121562

## phonebase-control count=2
### @558895
```
trol failed")}),F.on("close",()=>{clearTimeout(O),f(A,"Phone control disconnected")}),F.on("message",(M,G)=>{if(!A.closed)try{if(G||M.length>ko||!C())throw new Error;let X=JSON.parse(M.toString("utf8"));if(X.type==="ready"){if(A.ready||X.protocol!=="phonebase-control"||X.version!==1||X.deviceId!==L.deviceId||X.controlAvailable!==!0||!ea(X.geometry))throw new Error;A.ready=!0,A.homeAvailable=X.homeAvailable===!0,A.textAvailable=X.textAvailable===!0,A.keyboardAvailable=X.keyboardAvailable===!0,cle
```
### @674492
```
;if(!it||typeof it!="object"||Array.isArray(it))throw new Error;if(C.find(Yt=>Yt.id===g)?.deviceId!==V.phoneDeviceId)throw new Error;if(it.type==="ready"){let Yt=Object.hasOwn(it,"recordId")?it.recordId===g:it.deviceId===g;if(V.ready||it.protocol!=="phonebase-control"||it.version!==1||!Yt||it.deviceId!==V.phoneDeviceId||it.controlAvailable!==!0||!ea(it.geometry))throw new Error;V.ready=!0,V.homeAvailable=it.homeAvailable===!0,V.textAvailable=it.textAvailable===!0,V.keyboardAvailable=it.keyboardA
```

## control-request count=1
### @671133
```
"boolean")throw new Error;let V=S.get(le.deviceId);if(!le.active){V&&pe(V);return}if(V)return;let ne={id:le.deviceId,demanded:!0,local:null,cloud:null,configuration:null,lastFrameAt:0,retry:null,viewer:null};S.set(ne.id,ne),Ie(ne)}else if(le.type==="control-request"){if(typeof le.deviceId!="string"||!na.test(le.deviceId)||!C.some(V=>V.id===le.deviceId)||typeof le.sessionId!="string"||!lm.test(le.sessionId))throw new Error;ke(le.deviceId,le.sessionId)}else if(le.type==="control-cancel"){if(typeof
```

## function Lp count=1
### @554454
```
gth(e,"utf8")>oS)return!1;for(let t=0;t<e.length;t++){let r=e.charCodeAt(t);if(r<32&&r!==9&&r!==10||r>=127&&r<=159)return!1;if(r>=55296&&r<=56319){let i=e.charCodeAt(++t);if(!(i>=56320&&i<=57343))return!1}else if(r>=56320&&r<=57343)return!1}return!0}function Lp(e,t=0){if(!e||typeof e!="object"||Array.isArray(e))throw new Error("控制消息格式错误");if(e.type==="keepalive")return{type:"keepalive"};if(e.type==="text"||e.type==="key"){if(!cn(e.seq)||e.seq<=t)throw new Error("输入序号无效");if(e.type==="text"){if(!
```

## Lp( count=3
### @554463
```
f8")>oS)return!1;for(let t=0;t<e.length;t++){let r=e.charCodeAt(t);if(r<32&&r!==9&&r!==10||r>=127&&r<=159)return!1;if(r>=55296&&r<=56319){let i=e.charCodeAt(++t);if(!(i>=56320&&i<=57343))return!1}else if(r>=56320&&r<=57343)return!1}return!0}function Lp(e,t=0){if(!e||typeof e!="object"||Array.isArray(e))throw new Error("控制消息格式错误");if(e.type==="keepalive")return{type:"keepalive"};if(e.type==="text"||e.type==="key"){if(!cn(e.seq)||e.seq<=t)throw new Error("输入序号无效");if(e.type==="text"){if(!uS(e.text
```
### @559851
```
sed)try{if(!A.ready||F.readyState!==Ar.default.OPEN||G||M.length>ko||!C())throw new Error("控制通道尚未就绪或格式错误");let X=Date.now();if(X-A.rateStart>=1e3&&(A.rateStart=X,A.messages=0),++A.messages>90||F.bufferedAmount>i)throw new Error("控制消息过多或连接阻塞");let ue=Lp(JSON.parse(M.toString("utf8")),A.sequence);if(ue.type!=="keepalive"&&(A.sequence=ue.seq),ue.type==="button"&&!A.homeAvailable){h(A,{type:"ack",seq:ue.seq,ok:!1,error:"当前基座不支持 Home 按键，请更新 IPA"}),f(A,"Home unavailable");return}if(ue.type==="text"&&!
```
### @675528
```
tate!==Ar.default.OPEN||!Ee(g)||C.find(Yt=>Yt.id===g)?.deviceId!==V.phoneDeviceId||Pe||Ae.length>8192||V.local.bufferedAmount>pl)throw new Error;let Ke=Date.now();if(Ke-V.rateAt>=1e3&&(V.rateAt=Ke,V.messages=0),++V.messages>90)throw new Error;let it=Lp(JSON.parse(Ae.toString("utf8")),V.sequence);if(it.type==="button"&&!V.homeAvailable)throw new Error;if(it.type==="text"&&!V.textAvailable||it.type==="key"&&!V.keyboardAvailable)throw new Error;it.type!=="keepalive"&&(V.sequence=it.seq),V.local.sen
```

## type:"button" count=1
### @555001
```
096 字节，且不含不支持的控制字符");return{type:"text",seq:e.seq,text:e.text}}if(!cS.includes(e.key))throw new Error("键盘按键无效");return{type:"key",seq:e.seq,key:e.key}}if(e.type==="button"){if(e.button!=="home"||!cn(e.seq)||e.seq<=t)throw new Error("按键或序号无效");return{type:"button",button:"home",seq:e.seq}}if(e.type!=="pointer"||!["down","move","up","cancel"].includes(e.action)||!cn(e.seq)||e.seq<=t)throw new Error("触控动作或序号无效");let r={type:"pointer",action:e.action,seq:e.seq};if(e.action==="cancel")return r;if(!Fp
```

## type:"key" count=1
### @554870
```
==="key"){if(!cn(e.seq)||e.seq<=t)throw new Error("输入序号无效");if(e.type==="text"){if(!uS(e.text))throw new Error("文字须为非空有效 UTF-8、最多 4096 字节，且不含不支持的控制字符");return{type:"text",seq:e.seq,text:e.text}}if(!cS.includes(e.key))throw new Error("键盘按键无效");return{type:"key",seq:e.seq,key:e.key}}if(e.type==="button"){if(e.button!=="home"||!cn(e.seq)||e.seq<=t)throw new Error("按键或序号无效");return{type:"button",button:"home",seq:e.seq}}if(e.type!=="pointer"||!["down","move","up","cancel"].includes(e.action)||!cn(e.
```

## type:"text" count=1
### @554779
```
ror("控制消息格式错误");if(e.type==="keepalive")return{type:"keepalive"};if(e.type==="text"||e.type==="key"){if(!cn(e.seq)||e.seq<=t)throw new Error("输入序号无效");if(e.type==="text"){if(!uS(e.text))throw new Error("文字须为非空有效 UTF-8、最多 4096 字节，且不含不支持的控制字符");return{type:"text",seq:e.seq,text:e.text}}if(!cS.includes(e.key))throw new Error("键盘按键无效");return{type:"key",seq:e.seq,key:e.key}}if(e.type==="button"){if(e.button!=="home"||!cn(e.seq)||e.seq<=t)throw new Error("按键或序号无效");return{type:"button",button:"home",
```

## type:"keepalive" count=1
### @554576
```
1;if(r>=55296&&r<=56319){let i=e.charCodeAt(++t);if(!(i>=56320&&i<=57343))return!1}else if(r>=56320&&r<=57343)return!1}return!0}function Lp(e,t=0){if(!e||typeof e!="object"||Array.isArray(e))throw new Error("控制消息格式错误");if(e.type==="keepalive")return{type:"keepalive"};if(e.type==="text"||e.type==="key"){if(!cn(e.seq)||e.seq<=t)throw new Error("输入序号无效");if(e.type==="text"){if(!uS(e.text))throw new Error("文字须为非空有效 UTF-8、最多 4096 字节，且不含不支持的控制字符");return{type:"text",seq:e.seq,text:e.text}}if(!cS.inclu
```

## type:"ack" count=2
### @559986
```
Start>=1e3&&(A.rateStart=X,A.messages=0),++A.messages>90||F.bufferedAmount>i)throw new Error("控制消息过多或连接阻塞");let ue=Lp(JSON.parse(M.toString("utf8")),A.sequence);if(ue.type!=="keepalive"&&(A.sequence=ue.seq),ue.type==="button"&&!A.homeAvailable){h(A,{type:"ack",seq:ue.seq,ok:!1,error:"当前基座不支持 Home 按键，请更新 IPA"}),f(A,"Home unavailable");return}if(ue.type==="text"&&!A.textAvailable||ue.type==="key"&&!A.keyboardAvailable){h(A,{type:"ack",seq:ue.seq,ok:!1,error:"当前基座不支持此文字或键盘输入，请更新 IPA"}),f(A,"Keyboar
```
### @560162
```
eepalive"&&(A.sequence=ue.seq),ue.type==="button"&&!A.homeAvailable){h(A,{type:"ack",seq:ue.seq,ok:!1,error:"当前基座不支持 Home 按键，请更新 IPA"}),f(A,"Home unavailable");return}if(ue.type==="text"&&!A.textAvailable||ue.type==="key"&&!A.keyboardAvailable){h(A,{type:"ack",seq:ue.seq,ok:!1,error:"当前基座不支持此文字或键盘输入，请更新 IPA"}),f(A,"Keyboard input unavailable");return}F.send(JSON.stringify(ue))}catch(X){h(A,{type:"error",error:X.message}),f(A,"Invalid control command")}}),n.emit("connection",$,u)})}catch{!p.destr
```

## type:"ready" count=1
### @1118877
```
`)),N=!0}catch(j){await Xd(u,b),u=null,i(`HTTPS 未开启：${j.code==="ENOENT"?"未找到桌面程序生成的 TLS 证书":j.message}。本机仍可使用 http://localhost:${o.httpPort}。`)}let L=await Nu(e.ipaFile).then(j=>j.isFile()).catch(()=>!1);return L||i("基座 IPA 文件未找到；设备管理和本机观看仍可使用。"),S={type:"ready",ok:!0,app:tu,protocol:C1,version:"1.0",pid:process.pid,commercial:o.commercial===!0,localGuest:o.localGuest===!0,accountScoped:o.accountScoped===!0,localAccountRequired:o.accountScoped===!0,phonePort:11019,endpointIdentity:!0,controlGeom
```

## geometry count=26
### @555274
```
ome",seq:e.seq}}if(e.type!=="pointer"||!["down","move","up","cancel"].includes(e.action)||!cn(e.seq)||e.seq<=t)throw new Error("触控动作或序号无效");let r={type:"pointer",action:e.action,seq:e.seq};if(e.action==="cancel")return r;if(!Fp(e.x)||!Fp(e.y)||!cn(e.geometryRevision)||!Number.isSafeInteger(e.frameTimestampUs)||e.frameTimestampUs<0)throw new Error("触控坐标或画面版本无效");return{...r,x:e.x,y:e.y,geometryRevision:e.geometryRevision,frameTimestampUs:e.frameTimestampUs}}function ea(e){let t=r=>Number.isIntege
```
### @555412
```
);let r={type:"pointer",action:e.action,seq:e.seq};if(e.action==="cancel")return r;if(!Fp(e.x)||!Fp(e.y)||!cn(e.geometryRevision)||!Number.isSafeInteger(e.frameTimestampUs)||e.frameTimestampUs<0)throw new Error("触控坐标或画面版本无效");return{...r,x:e.x,y:e.y,geometryRevision:e.geometryRevision,frameTimestampUs:e.frameTimestampUs}}function ea(e){let t=r=>Number.isInteger(r)&&r>=2&&r<=8192;return!!(e&&t(e.width)&&t(e.height)&&t(e.sourceWidth)&&t(e.sourceHeight)&&Number.isInteger(e.orientation)&&e.orientati
```
### @555431
```
ter",action:e.action,seq:e.seq};if(e.action==="cancel")return r;if(!Fp(e.x)||!Fp(e.y)||!cn(e.geometryRevision)||!Number.isSafeInteger(e.frameTimestampUs)||e.frameTimestampUs<0)throw new Error("触控坐标或画面版本无效");return{...r,x:e.x,y:e.y,geometryRevision:e.geometryRevision,frameTimestampUs:e.frameTimestampUs}}function ea(e){let t=r=>Number.isInteger(r)&&r>=2&&r<=8192;return!!(e&&t(e.width)&&t(e.height)&&t(e.sourceWidth)&&t(e.sourceHeight)&&Number.isInteger(e.orientation)&&e.orientation>=1&&e.orientatio
```

## seq: count=12
### @554791
```
误");if(e.type==="keepalive")return{type:"keepalive"};if(e.type==="text"||e.type==="key"){if(!cn(e.seq)||e.seq<=t)throw new Error("输入序号无效");if(e.type==="text"){if(!uS(e.text))throw new Error("文字须为非空有效 UTF-8、最多 4096 字节，且不含不支持的控制字符");return{type:"text",seq:e.seq,text:e.text}}if(!cS.includes(e.key))throw new Error("键盘按键无效");return{type:"key",seq:e.seq,key:e.key}}if(e.type==="button"){if(e.button!=="home"||!cn(e.seq)||e.seq<=t)throw new Error("按键或序号无效");return{type:"button",button:"home",seq:e.seq}}i
```
### @554881
```
f(!cn(e.seq)||e.seq<=t)throw new Error("输入序号无效");if(e.type==="text"){if(!uS(e.text))throw new Error("文字须为非空有效 UTF-8、最多 4096 字节，且不含不支持的控制字符");return{type:"text",seq:e.seq,text:e.text}}if(!cS.includes(e.key))throw new Error("键盘按键无效");return{type:"key",seq:e.seq,key:e.key}}if(e.type==="button"){if(e.button!=="home"||!cn(e.seq)||e.seq<=t)throw new Error("按键或序号无效");return{type:"button",button:"home",seq:e.seq}}if(e.type!=="pointer"||!["down","move","up","cancel"].includes(e.action)||!cn(e.seq)||e.seq
```
### @555029
```
type:"text",seq:e.seq,text:e.text}}if(!cS.includes(e.key))throw new Error("键盘按键无效");return{type:"key",seq:e.seq,key:e.key}}if(e.type==="button"){if(e.button!=="home"||!cn(e.seq)||e.seq<=t)throw new Error("按键或序号无效");return{type:"button",button:"home",seq:e.seq}}if(e.type!=="pointer"||!["down","move","up","cancel"].includes(e.action)||!cn(e.seq)||e.seq<=t)throw new Error("触控动作或序号无效");let r={type:"pointer",action:e.action,seq:e.seq};if(e.action==="cancel")return r;if(!Fp(e.x)||!Fp(e.y)||!cn(e.geome
```

## home count=17
### @535565
```
ptime);return t===null&&r===null?null:{serviceFootprintBytes:t,serviceResidentBytes:r,sampledAtUptime:i}}function JE(e){let t=s=>typeof s=="number"&&Number.isFinite(s)&&s>0&&s<=4102444800?s:null;if(!Mu(e)||!["host-app","startup-widget","testflight","home-widget","network-startup","app-association","hotspot-wake","network-recovery"].includes(e.source))return null;let r=t(e.requestedAtUnix),i=t(e.processStartedAtUnix);return r&&i?{source:e.source,requestedAtUnix:r,processStartedAtUnix:i}:null}func
```
### @538554
```
(e.memory),n=YE(e.recovery),a=JE(e.launchInfo);return{protocol:"lan-phonebase",version:"1.0",port:t,deviceId:e.deviceId,name:e.name.trim().slice(0,80),streaming:e.streaming,width:r(e.width),height:r(e.height),controlAvailable:e.controlAvailable===!0,homeAvailable:e.homeAvailable===!0,textAvailable:e.textAvailable===!0,keyboardAvailable:e.keyboardAvailable===!0,...Zn(e),...e.wallVideo===!0?{wallVideo:!0}:{},...e.licenseRequired===!0?{licenseRequired:!0,...typeof e.licenseProtocol=="string"?{licen
```
### @538570
```
e.recovery),a=JE(e.launchInfo);return{protocol:"lan-phonebase",version:"1.0",port:t,deviceId:e.deviceId,name:e.name.trim().slice(0,80),streaming:e.streaming,width:r(e.width),height:r(e.height),controlAvailable:e.controlAvailable===!0,homeAvailable:e.homeAvailable===!0,textAvailable:e.textAvailable===!0,keyboardAvailable:e.keyboardAvailable===!0,...Zn(e),...e.wallVideo===!0?{wallVideo:!0}:{},...e.licenseRequired===!0?{licenseRequired:!0,...typeof e.licenseProtocol=="string"?{licenseProtocol:e.lic
```

## /control/ count=3
### @556943
```
dyState!==Ar.default.OPEN)){if(u.browser.bufferedAmount>i)return f(u,"Control output stalled");u.browser.send(JSON.stringify(p))}}e.on("upgrade",async(u,p,y)=>{let S;try{S=new URL(u.url,"http://local.invalid").pathname}catch{return}if(!S.startsWith("/control/"))return;if(p.on("error",()=>{}),c)return o(p,503,"Service Unavailable");if(!nS(u.socket.remoteAddress)&&!Bs(aS(u.socket.remoteAddress),t.network)||!lS(u))return o(p,403,"Forbidden");try{s?.(u)}catch{return o(p,401,"Unauthorized")}let B=/^\
```
### @651634
```
eam=null,b.configuration=null,b.lastFrameAt=0,f(b,!1),h(b))})}let p=(b,D,C)=>b.end(`HTTP/1.1 ${D} ${C}\r Connection: close\r Content-Length: 0\r \r `);e.on("upgrade",(b,D,C)=>{try{let $=new URL(b.url,"http://local.invalid").pathname;if($.startsWith("/control/")||$.startsWith("/rental/"))return}catch{return p(D,400,"Bad Request")}if(!fl(b.socket.remoteAddress)&&!Bs(om(b.socket.remoteAddress),t.network)||!hi(b))return p(D,403,"Forbidden");try{i?.(b)}catch{return p(D,401,"Unauthorized")}let A,N;try
```
### @673976
```
ye(V,"Control disconnected");V.deadline=setTimeout(()=>ye(V,"Control ready timeout"),5e3),V.deadline.unref(),le.on("error",ne),le.on("close",ne),le.on("open",()=>{if(V.closed)return _e(le);if(!Ee(g))return ye(V,"Live video required");let Ae=ve(ue(d,`/control/${encodeURIComponent(g)}`),8192,!1);V.local=Ae,Ae.on("error",ne),Ae.on("close",ne),Ae.on("message",(Pe,Ke)=>{if(!V.closed)try{if(Ke||Pe.length>8192||le.readyState!==Ar.default.OPEN||le.bufferedAmount>pl)throw new Error;let it=JSON.parse(Pe.t
```

## lanControl count=7
### @658129
```
e);let oe=new Set(l.records().map(Ee=>Ee.deviceId)),Ie=!y&&l.records().find(Ee=>Ee.ip===te&&Ee.port===Z);if(Ie){ye.existing.push(Ie);continue}try{let Ee=await l.add({ip:te,port:Z});(oe.has(Ee.deviceId)?ye.existing:ye.added).push(Ee),P.reset(Ee.id),b.lanControl.reset(Ee.id)}catch(Ee){ye.rejected.push({ip:te,port:Z,error:Ee.message,code:Ee.code??"ADD_FAILED"})}}return Er(N,200,{...ye,remaining:d?Math.max(0,l.maxSavedDevices-l.records().length):y?.account()?.remaining??Math.max(0,l.maxSavedDevices-
```
### @660742
```
or:"扫描、添加和移除设备只能在服务器电脑的 localhost 页面操作"});if(!hi(A))return Er(N,403,{error:"管理请求必须来自当前页面"});if(j==="/api/scan"){let ye=await sa(A);return Er(N,200,ye.async===!0?l.startScan(ye):await l.scan(ye))}if(ve)return await l.remove(ve[1]),P.reset(ve[1],!0),b.lanControl.reset(ve[1]),Er(N,200,{ok:!0});let _e=await l.add(await sa(A));return P.reset(_e.id),b.lanControl.reset(_e.id),Er(N,200,{device:_e})}if(A.method==="GET"&&["/PhoneBase-Final-v0.12.2.ipa","/PhoneBase-Final-v0.12.1.ipa","/PhoneBase-Final-v0.1
```
### @660840
```
="/api/scan"){let ye=await sa(A);return Er(N,200,ye.async===!0?l.startScan(ye):await l.scan(ye))}if(ve)return await l.remove(ve[1]),P.reset(ve[1],!0),b.lanControl.reset(ve[1]),Er(N,200,{ok:!0});let _e=await l.add(await sa(A));return P.reset(_e.id),b.lanControl.reset(_e.id),Er(N,200,{device:_e})}if(A.method==="GET"&&["/PhoneBase-Final-v0.12.2.ipa","/PhoneBase-Final-v0.12.1.ipa","/PhoneBase-Final-v0.12.0.ipa","/PhoneBase-NetworkWake-v0.11.1-Beta.ipa","/PhoneBase-NetworkWake-v0.11.0-Beta.ipa","/Pho
```

## ea( count=6
### @555494
```
;if(!Fp(e.x)||!Fp(e.y)||!cn(e.geometryRevision)||!Number.isSafeInteger(e.frameTimestampUs)||e.frameTimestampUs<0)throw new Error("触控坐标或画面版本无效");return{...r,x:e.x,y:e.y,geometryRevision:e.geometryRevision,frameTimestampUs:e.frameTimestampUs}}function ea(e){let t=r=>Number.isInteger(r)&&r>=2&&r<=8192;return!!(e&&t(e.width)&&t(e.height)&&t(e.sourceWidth)&&t(e.sourceHeight)&&Number.isInteger(e.orientation)&&e.orientation>=1&&e.orientation<=8&&cn(e.revision)&&Number.isSafeInteger(e.changedAtUs)&&e.ch
```
### @558981
```
F.on("message",(M,G)=>{if(!A.closed)try{if(G||M.length>ko||!C())throw new Error;let X=JSON.parse(M.toString("utf8"));if(X.type==="ready"){if(A.ready||X.protocol!=="phonebase-control"||X.version!==1||X.deviceId!==L.deviceId||X.controlAvailable!==!0||!ea(X.geometry))throw new Error;A.ready=!0,A.homeAvailable=X.homeAvailable===!0,A.textAvailable=X.textAvailable===!0,A.keyboardAvailable=X.keyboardAvailable===!0,clearTimeout(O)}else if(!A.ready||!["geometry","ack","error"].includes(X.type))throw new 
```
### @559262
```
A.ready=!0,A.homeAvailable=X.homeAvailable===!0,A.textAvailable=X.textAvailable===!0,A.keyboardAvailable=X.keyboardAvailable===!0,clearTimeout(O)}else if(!A.ready||!["geometry","ack","error"].includes(X.type))throw new Error;if(X.type==="geometry"&&!ea(X.geometry))throw new Error;if(X.type==="ack"&&(!cn(X.seq)||typeof X.ok!="boolean"))throw new Error;h(A,X.type==="ready"?{...X,recordId:b.id,textAvailable:A.textAvailable,keyboardAvailable:A.keyboardAvailable}:X)}catch{h(A,{type:"error",error:"手机控
```
