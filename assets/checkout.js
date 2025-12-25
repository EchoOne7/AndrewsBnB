const ROOMS_URL = "/rooms.json";

const DOW = ["Mo","Tu","We","Th","Fr","Sa","Su"];
function pad2(n){ return String(n).padStart(2,"0"); }
function toISODate(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function parseISO(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y, m-1, d); }
function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function monthTitle(d){ return d.toLocaleString(undefined, { month:"long", year:"numeric" }); }
function nightsBetween(startISO, endISO){
  const a = parseISO(startISO);
  const b = parseISO(endISO);
  return Math.max(0, Math.round((b.getTime()-a.getTime())/86400000));
}
function isDateBooked(dateISO, bookedRanges){
  const t = parseISO(dateISO).getTime();
  return (bookedRanges||[]).some(r=>{
    const a=parseISO(r.start).getTime();
    const b=parseISO(r.end).getTime();
    return t>=a && t<=b;
  });
}
function selectionOverlapsBooked(selStartISO, selEndISO, bookedRanges){
  const a = parseISO(selStartISO).getTime();
  const b = parseISO(selEndISO).getTime();
  return (bookedRanges||[]).some(r=>{
    const x = parseISO(r.start).getTime();
    const y = parseISO(r.end).getTime();
    return !(b < x || a > y);
  });
}

function createCalendar(root, opts){
  const state = { month: new Date(), start:null, end:null };

  root.innerHTML = "";
  const top = document.createElement("div");
  top.className = "calTop";

  const title = document.createElement("div");
  title.className = "calTitle";

  const nav = document.createElement("div");
  nav.className = "calNav";
  const prev = document.createElement("button"); prev.type="button"; prev.textContent="‹";
  const next = document.createElement("button"); next.type="button"; next.textContent="›";
  nav.append(prev,next);
  top.append(title,nav);

  const grid = document.createElement("div");
  grid.className = "calGrid";
  DOW.forEach(d=>{
    const x=document.createElement("div");
    x.className="dow";
    x.textContent=d;
    grid.append(x);
  });

  const inRange = (iso)=>{
    if(!state.start || !state.end) return false;
    const t=parseISO(iso).getTime();
    return t > parseISO(state.start).getTime() && t < parseISO(state.end).getTime();
  };

  const dayCell = (dateObj, muted)=>{
    const iso = toISODate(dateObj);
    const booked = isDateBooked(iso, opts.bookedRanges);
    const cell = document.createElement("div");
    cell.className = "day" + (muted?" muted":"") + (booked?" disabled":"");
    cell.textContent = String(dateObj.getDate());

    if(state.start === iso) cell.classList.add("start");
    if(state.end === iso) cell.classList.add("end");
    if(inRange(iso)) cell.classList.add("inRange");

    if(booked) return cell;

    cell.addEventListener("click", ()=>{
      if(!state.start || (state.start && state.end)){
        state.start = iso; state.end = null;
      }else{
        if(parseISO(iso).getTime() < parseISO(state.start).getTime()){
          state.end = state.start; state.start = iso;
        }else{
          state.end = iso;
        }
      }

      let msg = "";
      if(state.start && state.end && selectionOverlapsBooked(state.start, state.end, opts.bookedRanges)){
        msg = "That range includes booked dates. Please choose different dates.";
      }
      opts.onChange?.(state.start, state.end, msg);
      render();
    });

    return cell;
  };

  const render = ()=>{
    while(grid.children.length > 7) grid.removeChild(grid.lastChild);
    title.textContent = monthTitle(state.month);

    const m0 = startOfMonth(state.month);
    const m1 = endOfMonth(state.month);
    const firstDow = (m0.getDay() + 6) % 7;
    const daysInMonth = m1.getDate();

    const prevEnd = endOfMonth(new Date(state.month.getFullYear(), state.month.getMonth()-1, 1));
    for(let i=firstDow; i>0; i--){
      const d = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate()-i+1);
      grid.append(dayCell(d, true));
    }
    for(let day=1; day<=daysInMonth; day++){
      grid.append(dayCell(new Date(state.month.getFullYear(), state.month.getMonth(), day), false));
    }

    const totalCells = grid.children.length - 7;
    const rem = totalCells % 7;
    const need = rem===0 ? 0 : 7-rem;
    for(let i=1;i<=need;i++){
      grid.append(dayCell(new Date(state.month.getFullYear(), state.month.getMonth()+1, i), true));
    }
  };

  prev.addEventListener("click", ()=>{ state.month = new Date(state.month.getFullYear(), state.month.getMonth()-1, 1); render(); });
  next.addEventListener("click", ()=>{ state.month = new Date(state.month.getFullYear(), state.month.getMonth()+1, 1); render(); });

  root.append(top, grid);
  render();

  return {
    setSelection(s,e){ state.start=s||null; state.end=e||null; render(); },
    getSelection(){ return {start:state.start, end:state.end}; }
  };
}

async function init(){
  const url = new URL(window.location.href);
  const roomId = url.searchParams.get("room");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  const res = await fetch(ROOMS_URL, { cache:"no-store" });
  const data = await res.json();

  document.getElementById("brandName").textContent = data.brand?.name || "Andrew's B&B";
  document.documentElement.style.setProperty("--accent", data.brand?.accent || "#7a0014");
  document.documentElement.style.setProperty("--gold", data.brand?.gold || "#caa04a");

  document.getElementById("contactEmail").textContent = data.contact?.email || "example@example.com";
  document.getElementById("contactPhone").textContent = data.contact?.phone || "+44 20 7946 0958";

  const room = (data.rooms||[]).find(r=>r.id===roomId) || (data.rooms||[])[0];
  if(!room) return;

  document.getElementById("roomTitle").textContent = room.name;
  document.getElementById("roomInfo").textContent = room.info || "";
  document.getElementById("roomPrice").textContent = `${room.currency}${room.price} / night`;

  const outDates = document.getElementById("outDates");
  const outNights = document.getElementById("outNights");
  const outTotal = document.getElementById("outTotal");
  const errEl = document.getElementById("checkoutErr");
  const confirmBtn = document.getElementById("confirmBtn");

  const cal = createCalendar(document.getElementById("checkoutCal"), {
    bookedRanges: room.bookedRanges || [],
    onChange: onChange
  });

  function onChange(s,e,msg){
    errEl.textContent = msg || "";

    if(!s || !e){
      outDates.textContent = s ? `${s} → …` : "—";
      outNights.textContent = "—";
      outTotal.textContent = "—";
      confirmBtn.disabled = true;
      return;
    }

    outDates.textContent = `${s} → ${e}`;
    const nights = nightsBetween(s,e);
    const total = nights * room.price;
    outNights.textContent = `${nights}`;
    outTotal.textContent = `${room.currency}${total}`;

    confirmBtn.disabled = !!msg;
  }

  // prefill from query params
  if(start && end){
    cal.setSelection(start, end);
    const msg = selectionOverlapsBooked(start, end, room.bookedRanges||[])
      ? "That range includes booked dates. Please choose different dates."
      : "";
    onChange(start, end, msg);
  }else{
    onChange(null, null, "");
  }

  confirmBtn.addEventListener("click", ()=>{
    alert("Demo: Booking request sent (no payment taken).");
  });
}

init().catch(console.error);
