# /api/scan flow (static reconstruction)

## mdns browse
- needle: `find({type:"phonebase",protocol:"tcp"`
- offset: 539963
```
d)return[];let r=new zE.Bonjour({interface:an(e.address)},()=>{}),i=new Map,s=r.find({type:"phonebase",protocol:"tcp"},c=>{for(let o of c.addresses??[])Bs(o,e)&&Number.isInteger(c.port)&&c.port>=1&&c.port<=65535&&i.set(`${o}:${c.port}`,{ip:o,port:c.port})}),n,a;try{await new Promise(c=>{n=setTimeout(c,800),a=c,t?.addEventListener("abort",a,{once:!0})})}final
```

## scan status object
- needle: `"/api/scan/status"`
- offset: 657291
```
:"云发布服务正在初始化，请稍后再试",code:"CLOUD_PUBLISH_UNAVAILABLE"})}if(A.method==="GET"&&j==="/api/scan/status")return Er(N,200,l.scanStatus());if(A.method==="POST"&&j==="/api/scan/cancel")return!F||!hi(A)?Er(N,403,{error:"搜索只能在本机操作"}):Er(N,200,l.cancelScan());if(A.method==="POST"&&j==="/api/devices/batch"){if(!F||!hi(A))return Er(N,403,{error:"添加设备只能在本机操作"});let _e=awai
```

## scan cancel
- needle: `"/api/scan/cancel"`
- offset: 657368
```
==="/api/scan/status")return Er(N,200,l.scanStatus());if(A.method==="POST"&&j==="/api/scan/cancel")return!F||!hi(A)?Er(N,403,{error:"搜索只能在本机操作"}):Er(N,200,l.cancelScan());if(A.method==="POST"&&j==="/api/devices/batch"){if(!F||!hi(A))return Er(N,403,{error:"添加设备只能在本机操作"});let _e=await sa(A,65536);if(!Array.isArray(_e.devices)||!_e.devices.length||_e.devices.l
```

## scan start
- needle: `"/api/scan"`
- offset: 660400
```
api\/devices\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})$/.exec(j);if(A.method==="POST"&&["/api/scan","/api/devices"].includes(j)||A.method==="DELETE"&&ve){if(!F)return Er(N,403,{error:"扫描、添加和移除设备只能在服务器电脑的 localhost 页面操作"});if(!hi(A))return Er(N,403,{error:"管理请求必须来自当前页面"});if(j==="/api/scan"){let ye=await sa(A);return Er(N,200,ye.async===!0?l.startScan(ye):await l.sca
```

## fallback port Ku
- needle: `Ku=8879`
- offset: 536264
```
e(0,160):"",state:typeof e.state=="string"?e.state.slice(0,80):""}}var Ni=11019,Ku=8879,XE=100,ZE=999,$u=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/,kr=(e,t=400)=>Object.assign(new Error(e),{status:t});function Xn(e){if(typeof e!="string"||!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(e))return null;let t=e.split(".");return t.some(r=>Number(r)>255||String(Number(r))!==r)?null:t
```

## primary phone port
- needle: `Ni=11019`
- offset: 536255
```
ason.slice(0,160):"",state:typeof e.state=="string"?e.state.slice(0,80):""}}var Ni=11019,Ku=8879,XE=100,ZE=999,$u=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/,kr=(e,t=400)=>Object.assign(new Error(e),{status:t});function Xn(e){if(typeof e!="string"||!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(e))return null;let t=e.split(".");return t.some(r=>Number(r)>255||String(Number(r))!==
```

## validate device
- needle: `e.protocol!=="lan-phonebase"`
- offset: 538007
```
rn{...t?{modelIdentifier:t}:{},...r||t?{model:r||t}:{}}}function on(e,t){if(!e||e.protocol!=="lan-phonebase"||e.version!=="1.0"||typeof e.deviceId!="string"||!$u.test(e.deviceId)||typeof e.name!="string"||!e.name.trim()||typeof e.streaming!="boolean"||Number(e.port)!==t)throw kr("该地址不是兼容的局域网手机基座",422);let r=c=>Number.isInteger(c)&&c>=0&&c<=8192?c:0,i=Dp(e.vi
```

## phone /api/info fetch
- needle: `/api/info`
- offset: 539313
```
w(),signal:n}={}){let a=s(),c=AbortSignal.timeout(r),o=await i(`http://${e}:${t}/api/info`,{signal:n?AbortSignal.any([n,c]):c,redirect:"manual"});if(!o.ok)throw kr("手机服务未就绪，请先在手机打开服务",502);let f=o.body.getReader(),h=[],m=0;try{for(;;){let{done:p,value:y}=await f.read();if(p)break;if(m+=y.length,m>8192)throw kr("手机服务返回数据过大",422);h.push(y)}}finally{await f.can
```
