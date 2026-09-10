import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm";

const video = document.querySelector("#video");
const canvas = document.querySelector("#output");
const ctx = canvas.getContext("2d", {willReadFrequently:true});
const stage = document.querySelector("#stage");
const statusEl = document.querySelector("#status");
const handState = document.querySelector("#handState");
const hint = document.querySelector("#hint");
const permission = document.querySelector("#permission");
const startBtn = document.querySelector("#startBtn");
const captureBtn = document.querySelector("#captureBtn");
const cameraSwitch = document.querySelector("#cameraSwitch");
const prevBtn = document.querySelector("#prevBtn");
const nextBtn = document.querySelector("#nextBtn");
const filterName = document.querySelector("#filterName");
const filtersEl = document.querySelector("#filters");

const FILTERS = [
  {name:"Original", fn: original},
  {name:"Grid", fn: grid},
  {name:"Duotone", fn: duotone},
  {name:"Halftone", fn: halftone},
  {name:"RGB Shift", fn: rgbShift},
  {name:"Thermal", fn: thermal},
  {name:"Sepia", fn: sepia},
  {name:"Frosted", fn: frosted},
  {name:"Pink Halftone", fn: pinkHalftone}
];

let landmarker, stream, running=false, lastVideoTime=-1;
let facingMode="user", filterIndex=0, lastHands=0;
let closeLatch=false, lastSwitch=0;

FILTERS.forEach((f,i)=>{
  const b=document.createElement("button");
  b.className="filter-chip"+(i===0?" active":"");
  b.textContent=f.name;
  b.onclick=()=>setFilter(i);
  filtersEl.appendChild(b);
});

function setFilter(i){
  filterIndex=(i+FILTERS.length)%FILTERS.length;
  filterName.textContent=FILTERS[filterIndex].name;
  [...filtersEl.children].forEach((b,n)=>b.classList.toggle("active",n===filterIndex));
}
prevBtn.onclick=()=>setFilter(filterIndex-1);
nextBtn.onclick=()=>setFilter(filterIndex+1);

async function createTracker(){
  statusEl.textContent="Loading hand tracker…";
  const vision=await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
  );
  landmarker=await HandLandmarker.createFromOptions(vision,{
    baseOptions:{
      modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate:"GPU"
    },
    runningMode:"VIDEO",
    numHands:2,
    minHandDetectionConfidence:.55,
    minHandPresenceConfidence:.55,
    minTrackingConfidence:.55
  });
}

async function startCamera(){
  try{
    permission.style.display="none";
    statusEl.textContent="Requesting camera…";
    if(stream) stream.getTracks().forEach(t=>t.stop());
    stream=await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{facingMode,width:{ideal:1280},height:{ideal:720}}
    });
    video.srcObject=stream;
    await video.play();
    await createTracker();
    running=true;
    statusEl.textContent="Live";
    resize();
    requestAnimationFrame(loop);
  }catch(e){
    console.error(e);
    statusEl.textContent="Camera error";
    permission.style.display="grid";
    document.querySelector(".permission-card p").textContent =
      "Camera access failed. Use HTTPS/GitHub Pages and allow camera permission.";
  }
}
startBtn.onclick=startCamera;

cameraSwitch.onclick=async()=>{
  if(!running)return;
  facingMode=facingMode==="user"?"environment":"user";
  const old=stream;
  stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode,width:{ideal:1280},height:{ideal:720}}});
  old?.getTracks().forEach(t=>t.stop());
  video.srcObject=stream;
  await video.play();
};

function resize(){
  const r=stage.getBoundingClientRect();
  const d=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(r.width*d);
  canvas.height=Math.round(r.height*d);
  ctx.setTransform(d,0,0,d,0,0);
}
addEventListener("resize",resize);

function loop(){
  if(!running)return;
  if(video.readyState>=2 && video.currentTime!==lastVideoTime){
    lastVideoTime=video.currentTime;
    const result=landmarker.detectForVideo(video,performance.now());
    render(result);
  }
  requestAnimationFrame(loop);
}

function render(result){
  const w=stage.clientWidth,h=stage.clientHeight;
  ctx.save();
  ctx.clearRect(0,0,w,h);
  // Video itself is visible underneath. Draw a transparent canvas overlay.
  const hands=result.landmarks||[];
  lastHands=hands.length;
  handState.textContent=hands.length===2?"Portal ready":`${hands.length}/2 hands`;
  hint.style.opacity=hands.length===2?".15":"1";

  if(hands.length<2){ctx.restore();return;}

  const points=hands.map(hand=>({
    index: pt(hand[8],w,h),
    thumb: pt(hand[4],w,h)
  }));
  const p1=points[0].index,p2=points[0].thumb,p3=points[1].index,p4=points[1].thumb;
  const center={x:(p1.x+p2.x+p3.x+p4.x)/4,y:(p1.y+p2.y+p3.y+p4.y)/4};
  const width=(dist(p1,p2)+dist(p3,p4))/2;

  // Closing gesture: distance between the two hand centers.
  const c1={x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2};
  const c2={x:(p3.x+p4.x)/2,y:(p3.y+p4.y)/2};
  const gap=dist(c1,c2);
  const threshold=Math.max(75,w*.18);
  if(gap<threshold){
    if(!closeLatch && performance.now()-lastSwitch>800){
      setFilter(filterIndex+1);
      lastSwitch=performance.now();
    }
    closeLatch=true;
  }else if(gap>threshold*1.35){closeLatch=false;}

  drawPortal(p1,p2,p3,p4,w,h);
  drawGuides(points,center);
  ctx.restore();
}

function drawPortal(p1,p2,p3,p4,w,h){
  // Create a quadrilateral portal mask from the four fingertips.
  const minX=Math.max(0,Math.floor(Math.min(p1.x,p2.x,p3.x,p4.x)-18));
  const maxX=Math.min(w,Math.ceil(Math.max(p1.x,p2.x,p3.x,p4.x)+18));
  const minY=Math.max(0,Math.floor(Math.min(p1.y,p2.y,p3.y,p4.y)-18));
  const maxY=Math.min(h,Math.ceil(Math.max(p1.y,p2.y,p3.y,p4.y)+18));
  const bw=Math.max(1,maxX-minX),bh=Math.max(1,maxY-minY);

  // Approximate the original Python effect with a masked screen-space filter.
  const image=ctx.getImageData(minX,minY,bw,bh);
  FILTERS[filterIndex].fn(image,bw,bh);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p1.x,p1.y);ctx.lineTo(p3.x,p3.y);ctx.lineTo(p4.x,p4.y);ctx.lineTo(p2.x,p2.y);ctx.closePath();
  ctx.clip();
  ctx.putImageData(image,minX,minY);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p1.x,p1.y);ctx.lineTo(p3.x,p3.y);ctx.lineTo(p4.x,p4.y);ctx.lineTo(p2.x,p2.y);ctx.closePath();
  ctx.strokeStyle="rgba(255,255,255,.9)";
  ctx.lineWidth=2;
  ctx.shadowBlur=18;ctx.shadowColor="rgba(255,255,255,.7)";
  ctx.stroke();
  ctx.restore();
}

function drawGuides(points,c){
  ctx.save();
  ctx.fillStyle="#fff";
  points.forEach(x=>{
    [x.index,x.thumb].forEach(p=>{
      ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();
    });
  });
  ctx.restore();
}
function pt(p,w,h){return{x:p.x*w,y:p.y*h}}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}

function original(img){return img}
function grid(img,w,h){
  const d=img.data,step=22;
  for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){
    for(let k=0;k<Math.min(w-x,step);k++) setPix(d,(x+k)+y*w,[235,235,235,255],.28);
    for(let k=0;k<Math.min(h-y,step);k++) setPix(d,x+(y+k)*w,[235,235,235,255],.28);
  }
}
function duotone(img){
  const d=img.data;
  for(let i=0;i<d.length;i+=4){
    const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];
    let c=g<60?[15,8,10]:g<130?[118,30,214]:g<195?[35,140,235]:[235,240,240];
    d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];
  }
}
function halftone(img,w,h){dots(img,w,h,[15,15,15,255],[245,245,245,255],6,1.4)}
function pinkHalftone(img,w,h){dots(img,w,h,[55,20,130,255],[215,190,245,255],5,1.3)}
function dots(img,w,h,dot,bg,cell,factor){
  const d=img.data;for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,g=.299*d[i]+.587*d[i+1]+.114*d[i+2];
    const cx=x%cell-cell/2,cy=y%cell-cell/2,r=(1-g/255)*(cell/factor);
    const c=(cx*cx+cy*cy<r*r)?dot:bg;d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255;
  }
}
function rgbShift(img,w,h){
  const src=new Uint8ClampedArray(img.data),d=img.data,shift=6;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4, xr=Math.min(w-1,x+shift), xb=Math.max(0,x-shift);
    d[i]=src[(y*w+xr)*4];d[i+1]=src[i+1];d[i+2]=src[(y*w+xb)*4+2];
    if(y%3===0){d[i]*=.72;d[i+1]*=.72;d[i+2]*=.72}
  }
}
function thermal(img){
  const d=img.data;
  for(let i=0;i<d.length;i+=4){
    const g=(.299*d[i]+.587*d[i+1]+.114*d[i+2])/255;
    const c=thermalColor(g);d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];
  }
}
function thermalColor(t){
  t=Math.max(0,Math.min(1,t));
  const stops=[[0,0,0,80],[.25,0,180,255],[.5,0,255,80],[.75,255,255,0],[1,255,0,0]];
  for(let i=1;i<stops.length;i++)if(t<=stops[i][0]){
    const a=stops[i-1],b=stops[i],q=(t-a[0])/(b[0]-a[0]);
    return [a[1]+(b[1]-a[1])*q,a[2]+(b[2]-a[2])*q,a[3]+(b[3]-a[3])*q]
  }return [255,0,0]
}
function sepia(img,w,h){
  const d=img.data;
  for(let i=0;i<d.length;i+=4){
    const r=d[i],g=d[i+1],b=d[i+2];
    d[i]=Math.min(255,.393*r+.769*g+.189*b);d[i+1]=Math.min(255,.349*r+.686*g+.168*b);d[i+2]=Math.min(255,.272*r+.534*g+.131*b);
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,dx=x-w/2,dy=y-h/2,fall=Math.max(.5,1-.5*Math.hypot(dx,dy)/(Math.hypot(w/2,h/2)||1));
    d[i]*=fall;d[i+1]*=fall;d[i+2]*=fall;
  }
}
function frosted(img,w,h){
  const d=img.data,src=new Uint8ClampedArray(d);
  const radius=5;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let r=0,g=0,b=0,n=0;
    for(let yy=Math.max(0,y-radius);yy<=Math.min(h-1,y+radius);yy+=2)
      for(let xx=Math.max(0,x-radius);xx<=Math.min(w-1,x+radius);xx+=2){
        const i=(yy*w+xx)*4;r+=src[i];g+=src[i+1];b+=src[i+2];n++;
      }
    const i=(y*w+x)*4;d[i]=r/n*.55+255*.45;d[i+1]=g/n*.55+255*.45;d[i+2]=b/n*.55+255*.45;
  }
}
function setPix(d,index,color,a){
  const i=index*4;d[i]=d[i]*(1-a)+color[0]*a;d[i+1]=d[i+1]*(1-a)+color[1]*a;d[i+2]=d[i+2]*(1-a)+color[2]*a;d[i+3]=255;
}

captureBtn.onclick=()=>{
  if(!running)return;
  const a=document.createElement("a");
  a.download=`portal-fx-${Date.now()}.png`;
  a.href=canvas.toDataURL("image/png");
  a.click();
};
