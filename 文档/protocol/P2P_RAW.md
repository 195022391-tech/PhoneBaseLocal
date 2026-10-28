# P2P raw contexts

## entry

### stun:47.94.92.125:8445 @1056394
```
atus:n=()=>{},now:a=Date.now,allowLoopbackForTests:c=!1,PeerConnection:o=UB,Socket:f=Ar.default,fallback:h=!1,setupTimeoutMs:m=h?25e3:15e3,stunURL:l="stun:47.94.92.125:8445"}={}){if(!m1.test(t||""))throw Br("P2P_VIEWER_INVALID","signaling");let d=new URL(e);if(!/^[A-Za-z0-9_-]{43}$/.test(r||"")||d.username||d.password||d.search||d.hash||!["wss:",...c?["ws:"]:[]].includes(d.protocol)||d.protocol==="ws:"&&!["127.0.0.1","localhost"].includes(d.hostname)||l!=="stun:47.94.92.125:8445"&&!c)throw Br("P
```

### stun:47.94.92.125:8445 @1056705
```
password||d.search||d.hash||!["wss:",...c?["ws:"]:[]].includes(d.protocol)||d.protocol==="ws:"&&!["127.0.0.1","localhost"].includes(d.hostname)||l!=="stun:47.94.92.125:8445"&&!c)throw Br("P2P_ENDPOINT_INVALID","signaling");let u=!1,p,y,S=1,B,P,b="signaling",D=!1,C=!1,A=!1,N=!1,L=0,j=0,$=0,F=0,O=new Map,M=Promise.resolve(),G=0,X=new Set,ue=(ge,De)=>ge===B&&De>=(h?49160:1024)&&De<=(h?49359:65535)&&(!h||X.has(ge+":"+De)),ve=new Map,_e=()=>{for(let ge of p?.iceTransports||[])for(let De of ge.connect
```

### phonebase-p2p-frame-clock @1047699
```
ID","frame-clock");if(t===void 0)return!1;if(!y1(t,["protocol","ssrc","rtpTimestamp","sourceTimestampUs","geometryRevision","serial"])||t.protocol!=="phonebase-p2p-frame-clock-v1"||!Jc(t.ssrc)||!t.ssrc||!Jc(t.rtpTimestamp)||!Number.isSafeInteger(t.sourceTimestampUs)||t.sourceTimestampUs<e.changedAtUs||!v1(t.geometryRevision)||t.geometryRevision!==e.revision||!v1(t.serial))throw Br("P2P_FRAME_CLOCK_INVALID","frame-clock");if(this.anchor){if(t.ssrc!==this.anchor.ssrc)throw Br("P2P_FRAME_CLOCK_MISM
```

### phonebase-p2p-media-status @1070837
```
et ee=Y.media.stats();Y.p2pBytes=Y.baseP2pBytes+ee.p2pBytes,Y.relayBytes=Y.baseRelayBytes+(ee.relayBytes||0)}let te={type:"media-transport",protocol:"phonebase-p2p-media-status-v1",deviceId:pe,counterScope:"peer-udp-payload"};if(!Y)return{...te,state:"failed",mediaSessionId:null,generation:0,p2pBytes:0,relayBytes:0,p2pBitrateBps:0,relayBitrateBps:0,reason:"P2P_VIEW_NOT_OPEN",stage:"idle",code:"P2P_VIEW_NOT_OPEN"};let Z=Math.max(1,c()-Y.startedAt);return{...Y.status,...te,p2pBytes:Y.p2pBytes,rela
```

### p2p-start @1059336
```
es:j,lastFrameAgeMs:Math.max(0,Math.floor(a()-$))});for(let[ge,De]of O)a()-De>4e3&&O.delete(ge)}},1e3);return ke.unref?.(),Y.on("open",()=>{te({type:"p2p-start",viewerId:t,...h?{fallback:!0}:{}}),Z("checking","P2P_SIGNALING")}),Y.on("message",(ge,De)=>{if(!u){if(!De&&ge.length<=65536){let fe;try{fe=JSON.parse(ge.toString())}catch{}if(fe?.type==="p2p-close"&&(!y||pe(fe))){A=fe.fallbackAvailable===!0,/^[a-z-]{1,32}$/.test(fe.stage||"")&&(b=fe.stage),ee(/^[A-Z][A-Z0-9_]{0,63}$/.test(fe.code||"")?fe
```

### p2p-stop @1058002
```
,oe.close(),O.clear(),X.clear();for(let[fe,w]of ve)fe.off("message",w);if(ve.clear(),Y.readyState===Ar.default.OPEN){try{Y.send(JSON.stringify({type:"p2p-stop",mediaSessionId:y,generation:S,code:ge}))}catch{}Y.close(1e3),setTimeout(()=>Y.terminate(),250).unref?.()}else Y.terminate();p&&p.close().catch(()=>{}),De&&Z(ge==="P2P_UNSUPPORTED"?"unsupported":"failed",ge)}},oe=new VB({now:a,onKeyframeNeeded:()=>Ie.keyframe(),onPacket:ge=>{if(u)return;let De=is(ge);if(!De.configuration)for(F||(F=a()),O.s
```

### wss-hello @1084418
```
ARGE","DIRECT_PHONE_STATUS_UNREACHABLE"]),a8=new Set(["idle","restore","configure","challenge","session","session-renew","local-lease","wss-connect","wss-hello","online","stopped"]),o8=new Set(["none","network","tls","http","authorization","protocol","storage","local-lease","internal"]),c8=new Set(["none","method","host","port","no-trust","no-anchor","policy","anchors","anchor-only","evaluation"]);function S1(e){if(!e||!a8.has(e.stage)||!o8.has(e.errorCategory)||!Number.isInteger(e.errorCode)||e
```

### createOffer @1025501
```
cureManager&&(t.iceServers!==void 0||t.turnUdpFamily!==void 0)&&this.secureManager.updateIceServers()}getConfiguration(){return $B(this.config)}async createOffer({iceRestart:e}={}){(e||this.needRestart)&&(this.needRestart=!1,this.secureManager.restartIce()),await this.secureManager.ensureCerts();for(let r of this.transceiverManager.getTransceivers())(r.codecs.length===0||r.codecPreferencesNeedResolution)&&this.transceiverManager.assignTransceiverCodecs(r),r.headerExtensions.length===0&&(r.header
```

### createOffer @1030550
```
needed(),this.invalidateLastCreatedDescriptions();return}let r=!e?.type||!e.sdp||e.sdp.length===0?e?.type==="offer"?this.lastCreatedOffer??await this.createOffer():e?.type==="answer"||e?.type==="pranswer"?this.lastCreatedAnswer??await this.createAnswer():t.includes(this.signalingState)?this.lastCreatedOffer??await this.createOffer():this.lastCreatedAnswer??await this.createAnswer():void 0;if(e={type:e?.type??r.type,sdp:e?.sdp&&e.sdp.length>0?e.sdp:r.sdp},e.type==="offer"&&this.lastCreatedOffer&&
```

### iceServers @1010773
```
map(e=>e.iceTransport)}setupCertificate(e){this.certificate=new Cv(e.keyPem,e.certPem,e.signatureHash)}resolveIceServerOptions(){let e=kT(this.config.iceServers),t=RT({parsedTurnTransport:e.turnTransport,configuredTurnTransport:this.config.turnTransport,forceTurnTCP:this.config.forceTurnTCP});return{stunServer:e.stunServer,turnServer:e.turnServer,turnUsername:e.turnUsername,turnPassword:e.turnPassword,turnTransport:t}}updateIceServers(){let e={...this.resolveIceServerOptions(),forceTurn:this.con
```

### iceServers @1025367
```
is.config),[...this.config.headerExtensions.audio||[],...this.config.headerExtensions.video||[]].forEach((i,s)=>{i.id=1+s}),r&&this.secureManager&&(t.iceServers!==void 0||t.turnUdpFamily!==void 0)&&this.secureManager.updateIceServers()}getConfiguration(){return $B(this.config)}async createOffer({iceRestart:e}={}){(e||this.needRestart)&&(this.needRestart=!1,this.secureManager.restartIce()),await this.secureManager.ensureCerts();for(let r of this.transceiverManager.getTransceivers())(r.codecs.leng
```

### P2P_FRAME_CLOCK @1047528
```
etadata({geometry:e,frameClock:t}){if(!y1(e,["width","height","sourceWidth","sourceHeight","orientation","revision","changedAtUs"])||!ea(e))throw Br("P2P_FRAME_CLOCK_INVALID","frame-clock");if(t===void 0)return!1;if(!y1(t,["protocol","ssrc","rtpTimestamp","sourceTimestampUs","geometryRevision","serial"])||t.protocol!=="phonebase-p2p-frame-clock-v1"||!Jc(t.ssrc)||!t.ssrc||!Jc(t.rtpTimestamp)||!Number.isSafeInteger(t.sourceTimestampUs)||t.sourceTimestampUs<e.changedAtUs||!v1(t.geometryRevision)||t
```

### P2P_FRAME_CLOCK @1047934
```
afeInteger(t.sourceTimestampUs)||t.sourceTimestampUs<e.changedAtUs||!v1(t.geometryRevision)||t.geometryRevision!==e.revision||!v1(t.serial))throw Br("P2P_FRAME_CLOCK_INVALID","frame-clock");if(this.anchor){if(t.ssrc!==this.anchor.ssrc)throw Br("P2P_FRAME_CLOCK_MISMATCH","frame-clock");if(t.serial<=this.anchor.serial||t.sourceTimestampUs<=this.anchor.sourceTimestampUs||e.revision<this.geometry.revision)return!1;if(e.changedAtUs<this.geometry.changedAtUs||e.revision===this.geometry.revision&&Objec
```

### function is( @552653
```
 Error("unexpected configuration suffix");t+=3;let n=e[t++];for(let a=0;a<n;a++)i(13)}if(t!==e.length)throw new Error("trailing configuration bytes")}function is(e){let t=Buffer.isBuffer(e)?e:Buffer.from(e);if(t.length<21||t.length>rs||!t.subarray(0,4).equals(iS)||t[4]!==1||t[6]!==0||t[7]!==0)throw new Error("invalid packet header");let r=t[5];if(![0,1,2].includes(r)||t.readUInt32BE(16)!==t.length-20)throw new Error("invalid packet size or flags");let i=t.subarray(20),s=r===2,n=r===1;if(s)sS(i);
```

## app

### wss-hello @44459
```
le:"等待配置",restore:"恢复配置",configure:"保存配置",challenge:"请求设备挑战",session:"建立设备会话","session-renew":"续签设备会话","local-lease":"本机托管授权","wss-connect":"建立云端连接","wss-hello":"云端握手",online:"云端已连接",stopped:"服务关闭"}),Or=Object.freeze({none:"无错误",network:"网络",tls:"TLS证书",http:"HTTP响应",authorization:"授权",protocol:"协议",storage:"配置存储","local-lease":"本机授权",internal:"内部状态"}),qr=Object.freeze({none:"尚未报告拒绝点",method:"服务器认证方式不支持",host:"服务器地址不匹配",port:"服务器端口不匹配","no-trust":"未获取证书信任信息","no-anchor":"缺少公开CA证书",policy:"无法建立TL
```

### P2P_FRAME_CLOCK @185429
```
EASE_INVALID:"设备连接授权无效，请更新手机服务后重试",P2P_RELAY_FORBIDDEN:"画面连接校验失败，已停止接收，请联系客服",P2P_RTP_INVALID:"手机画面数据不完整，请重新连接",P2P_PACKET_INVALID:"手机画面数据校验失败，请重新连接",P2P_FRAME_CLOCK_INVALID:"手机画面信息无效，请重新连接",P2P_FRAME_CLOCK_MISMATCH:"手机画面信息已变化，请重新连接",P2P_FRAME_CLOCK_MISSING:"请更新手机服务后重新连接",P2P_FRAME_CLOCK_STALE:"手机画面更新中断，请重新连接",P2P_FRAME_CLOCK_BUFFER_LIMIT:"手机画面等待超时，请重新连接",P2P_BUSY:"这台设备正在连接中，请稍后重试",P2P_CAPACITY:"当前电脑打开的画面过多，请关闭部分窗口",P2P_ATTEMPT_LIMIT:"连接尝试过于频繁，请稍后重试",P2P_RATE_LIMITED:"重试过于频繁，请稍后再试",P2P_SERVER_ST
```

### P2P_FRAME_CLOCK @185470
```
LAY_FORBIDDEN:"画面连接校验失败，已停止接收，请联系客服",P2P_RTP_INVALID:"手机画面数据不完整，请重新连接",P2P_PACKET_INVALID:"手机画面数据校验失败，请重新连接",P2P_FRAME_CLOCK_INVALID:"手机画面信息无效，请重新连接",P2P_FRAME_CLOCK_MISMATCH:"手机画面信息已变化，请重新连接",P2P_FRAME_CLOCK_MISSING:"请更新手机服务后重新连接",P2P_FRAME_CLOCK_STALE:"手机画面更新中断，请重新连接",P2P_FRAME_CLOCK_BUFFER_LIMIT:"手机画面等待超时，请重新连接",P2P_BUSY:"这台设备正在连接中，请稍后重试",P2P_CAPACITY:"当前电脑打开的画面过多，请关闭部分窗口",P2P_ATTEMPT_LIMIT:"连接尝试过于频繁，请稍后重试",P2P_RATE_LIMITED:"重试过于频繁，请稍后再试",P2P_SERVER_STOPPED:"连接服务暂时停止，请稍后重试",P2P_CLOSED:"设备画面连接
```

## device

### phonebase-p2p-media-status @4636
```
" GB":e>=1e6?(e/1e6).toFixed(2)+" MB":(e/1e3).toFixed(1)+" KB",W=e=>Object.assign(new Error(e),{publicMessage:e});function dt(e){if(!e||e.protocol!=="phonebase-p2p-media-status-v1"||!Le.test(e.deviceId||"")||!["checking","direct","relay","failed","unsupported"].includes(e.state)||["p2pBytes","relayBytes","p2pBitrateBps","relayBitrateBps"].some(u=>!Number.isSafeInteger(e[u])||e[u]<0)||typeof e.stage!="string"||!/^[a-z][a-z0-9-]{0,39}$/.test(e.stage)||typeof e.code!="string"||!/^[A-Z][A-Z0-9_]{0,7
```

### P2P_FRAME_CLOCK @3488
```
EASE_INVALID:"设备连接授权无效，请更新手机服务后重试",P2P_RELAY_FORBIDDEN:"画面连接校验失败，已停止接收，请联系客服",P2P_RTP_INVALID:"手机画面数据不完整，请重新连接",P2P_PACKET_INVALID:"手机画面数据校验失败，请重新连接",P2P_FRAME_CLOCK_INVALID:"手机画面信息无效，请重新连接",P2P_FRAME_CLOCK_MISMATCH:"手机画面信息已变化，请重新连接",P2P_FRAME_CLOCK_MISSING:"请更新手机服务后重新连接",P2P_FRAME_CLOCK_STALE:"手机画面更新中断，请重新连接",P2P_FRAME_CLOCK_BUFFER_LIMIT:"手机画面等待超时，请重新连接",P2P_BUSY:"这台设备正在连接中，请稍后重试",P2P_CAPACITY:"当前电脑打开的画面过多，请关闭部分窗口",P2P_ATTEMPT_LIMIT:"连接尝试过于频繁，请稍后重试",P2P_RATE_LIMITED:"重试过于频繁，请稍后再试",P2P_SERVER_ST
```

### P2P_FRAME_CLOCK @3529
```
LAY_FORBIDDEN:"画面连接校验失败，已停止接收，请联系客服",P2P_RTP_INVALID:"手机画面数据不完整，请重新连接",P2P_PACKET_INVALID:"手机画面数据校验失败，请重新连接",P2P_FRAME_CLOCK_INVALID:"手机画面信息无效，请重新连接",P2P_FRAME_CLOCK_MISMATCH:"手机画面信息已变化，请重新连接",P2P_FRAME_CLOCK_MISSING:"请更新手机服务后重新连接",P2P_FRAME_CLOCK_STALE:"手机画面更新中断，请重新连接",P2P_FRAME_CLOCK_BUFFER_LIMIT:"手机画面等待超时，请重新连接",P2P_BUSY:"这台设备正在连接中，请稍后重试",P2P_CAPACITY:"当前电脑打开的画面过多，请关闭部分窗口",P2P_ATTEMPT_LIMIT:"连接尝试过于频繁，请稍后重试",P2P_RATE_LIMITED:"重试过于频繁，请稍后再试",P2P_SERVER_STOPPED:"连接服务暂时停止，请稍后重试",P2P_CLOSED:"设备画面连接
```
