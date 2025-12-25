const ROOMS_URL = "/rooms.json";

const DOW = ["Mo","Tu","We","Th","Fr","Sa","Su"];

function pad2(n){ return String(n).padStart(2,"0"); }
function toISODate(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function parseISO(s){
  const [y,m,d]=s.split("-").map(Number);
  return new Date(y, m-1, d);
}
function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate()+days);
  return d;
}
function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function monthTitle(d){
  return d.toLocaleString(undefined, { month:"long", year:"numeric" });
}

// inclusive ranges in JSON: start..end
function isDateBooked(dateISO, bookedRanges){
  const t = parseISO(dateISO).getTime();
  return bookedRanges.some(r=>{
    const a=parseISO(r.start).getTime();
    const b=parseISO(r.end).getTime();
    return t>=a && t<=b;
  });
}

// overlap check for a selected range [start, end] inclusive
function selectionOverlapsBooked(selStartISO, selEndISO, bookedRanges){
  const a = parseISO(selStartISO).getTime();
  const b = parseISO(selEndISO).getTime();
  return bookedRanges.some(r=>{
    const x = parseISO(r.start).getTime();
    const y = parseISO(r.end).getTime();
    return !(b < x || a > y);
  });
}

function nightsBetween(startISO, endISO){
  const a = parseISO(startISO);
  const b = parseISO(endISO);
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.round(ms / 86400000)); // end is checkout day
}

function clampToImageFallback(imgEl){
  imgEl.onerror = () => {
    imgEl.removeAttribute("src");
    imgEl.style.background = "linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,.02))";
  };
}

function buildThumb(room, accent){
  const el = document.createElement("div");
  el.className = "thumb";
  el.dataset.scrollTo = room.id;

  const img = document.createElement("img");
  img.alt = room.name;
  img.src = room.images?.[0] || "";
  clampToImageFallback(img);

  const meta = document.createElement("div");
  meta.className = "meta";

  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = accent;

  const t = document.createElement("span");
  t.className = "t";
  t.textContent = room.name;

  const p = document.createElement("span");
  p.className = "p";
  p.textContent = `${room.currency}${room.price}/night`;

  meta.append(dot, t, p);
  el.append(img, meta);

  el.addEventListener("click", ()=>{
    const target = document.getElementById(room.id);
    if(target) target.scrollIntoView({ behavior:"smooth", block:"start" });
  });

  return el;
}

function createCalendar(root, opts){
  // opts: { bookedRanges, onChange(startISO,endISO, overlapMsg), initialMonthISO }
  const state = {
    month: opts.initialMonthISO ? parseISO(opts.initialMonthISO) : new Date(),
    start: null,
    end: null
  };

  const calWrap = root;
  calWrap.innerHTML = "";

  const top = document.createElement("div");
  top.className = "calTop";

  const title = document.createElement("div");
  title.className = "calTitle";

  const nav = document.createElement("div");
  nav.className = "calNav";

  const prev = document.createElement("button");
  prev.type = "button";
  prev.textContent = "‹";
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "›";

  nav.append(prev, next);
  top.append(title, nav);

  const grid = document.createElement("div");
  grid.className = "calGrid";

  // DOW
  DOW.forEach(d=>{
    const x = document.createElement("div");
    x.className = "dow";
    x.textContent = d;
    grid.append(x);
  });

  const render = ()=>{
    // clear day cells, keep 7 dow at start
    while(grid.children.length > 7){
      grid.removeChild(grid.lastChild);
    }

    title.textContent = monthTitle(state.month);

    const m0 = startOfMonth(state.month);
    const m1 = endOfMonth(state.month);

    // Monday-based index
    const firstDow = (m0.getDay() + 6) % 7; // convert Sun=0.. to Mon=0..
    const daysInMonth = m1.getDate();

    // show previous month trailing days to fill grid nicely
    const prevMonthEnd = endOfMonth(new Date(state.month.getFullYear(), state.month.getMonth()-1, 1));
    const prevDays = firstDow;
    for(let i=prevDays; i>0; i--){
      const d = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), prevMonthEnd.getDate()-i+1);
      grid.append(dayCell(d, true));
    }

    for(let day=1; day<=daysInMonth; day++){
      const d = new Date(state.month.getFullYear(), state.month.getMonth(), day);
      grid.append(dayCell(d, false));
    }

    // next month leading to complete rows (up to 6 weeks)
    const totalCells = grid.children.length - 7;
    const remainder = totalCells % 7;
    const need = remainder === 0 ? 0 : (7 - remainder);
    for(let i=1; i<=need; i++){
      const d = new Date(state.month.getFullYear(), state.month.getMonth()+1, i);
      grid.append(dayCell(d, true));
    }
  };

  const inSelectedRange = (iso)=>{
    if(!state.start || !state.end) return false;
    const t = parseISO(iso).getTime();
    return t > parseISO(state.start).getTime() && t < parseISO(state.end).getTime();
  };

  const dayCell = (dateObj, muted)=>{
    const iso = toISODate(dateObj);
    const isBooked = isDateBooked(iso, opts.bookedRanges || []);
    const cell = document.createElement("div");
    cell.className = "day" + (muted ? " muted" : "") + (isBooked ? " disabled" : "");

    if(state.start === iso) cell.classList.add("start");
    if(state.end === iso) cell.classList.add("end");
    if(inSelectedRange(iso)) cell.classList.add("inRange");

    cell.textContent = String(dateObj.getDate());

    if(isBooked){
      cell.title = "Booked";
      return cell;
    }

    cell.addEventListener("click", ()=>{
      // selection logic
      if(!state.start || (state.start && state.end)){
        state.start = iso;
        state.end = null;
      }else{
        // set end, ensure end after start
        if(parseISO(iso).getTime() < parseISO(state.start).getTime()){
          state.end = state.start;
          state.start = iso;
        }else{
          state.end = iso;
        }
      }

      // overlap check only when both selected
      let overlapMsg = "";
      if(state.start && state.end){
        if(selectionOverlapsBooked(state.start, state.end, opts.bookedRanges || [])){
          overlapMsg = "That range includes booked dates. Please choose different dates.";
        }
      }

      opts.onChange?.(state.start, state.end, overlapMsg);
      render();
    });

    return cell;
  };

  prev.addEventListener("click", ()=>{
    state.month = new Date(state.month.getFullYear(), state.month.getMonth()-1, 1);
    render();
  });
  next.addEventListener("click", ()=>{
    state.month = new Date(state.month.getFullYear(), state.month.getMonth()+1, 1);
    render();
  });

  calWrap.append(top, grid);

  return {
    setMonth(iso){ state.month = parseISO(iso); render(); },
    setSelection(startISO, endISO){
      state.start = startISO || null;
      state.end = endISO || null;
      render();
    },
    getSelection(){ return { start: state.start, end: state.end }; }
  };
}

function buildRoomCard(room, brand){
  const card = document.createElement("article");
  card.className = "roomCard";
  card.id = room.id;

  const grid = document.createElement("div");
  grid.className = "roomGrid";

  // carousel
  const carousel = document.createElement("div");
  carousel.className = "carousel";

  const img = document.createElement("img");
  img.alt = room.name;
  let imgIndex = 0;
  img.src = room.images?.[0] || "";
  clampToImageFallback(img);

  const carBtns = document.createElement("div");
  carBtns.className = "carBtns";

  const left = document.createElement("button");
  left.className = "carBtn";
  left.type = "button";
  left.textContent = "‹";

  const right = document.createElement("button");
  right.className = "carBtn";
  right.type = "button";
  right.textContent = "›";

  const dots = document.createElement("div");
  dots.className = "dots";

  const dotEls = (room.images?.length ? room.images : [""]).map((_,i)=>{
    const d = document.createElement("span");
    if(i===0) d.classList.add("active");
    dots.append(d);
    return d;
  });

  function setCarousel(i){
    const imgs = room.images?.length ? room.images : [""];
    imgIndex = (i + imgs.length) % imgs.length;
    img.src = imgs[imgIndex] || "";
    dotEls.forEach((d,idx)=>d.classList.toggle("active", idx===imgIndex));
  }

  left.addEventListener("click", ()=> setCarousel(imgIndex - 1));
  right.addEventListener("click", ()=> setCarousel(imgIndex + 1));

  carBtns.append(left, right);
  carousel.append(img, carBtns, dots);

  // divider
  const divider = document.createElement("div");
  divider.className = "divider";

  // right panel
  const panel = document.createElement("div");
  panel.className = "panel";

  const titleRow = document.createElement("div");
  titleRow.className = "roomTitleRow";

  const title = document.createElement("div");
  title.className = "roomTitle";
  title.textContent = room.name;

  const price = document.createElement("div");
  price.className = "roomPrice";
  price.textContent = `Price: ${room.currency}${room.price} / night`;

  titleRow.append(title, price);

  const info = document.createElement("div");
  info.className = "infoBox";
  info.innerHTML = `<b>Info:</b> ${room.info}`;

  const calShell = document.createElement("div");
  calShell.className = "calWrap";

  const calRoot = document.createElement("div");
  const cal = createCalendar(calRoot, {
    bookedRanges: room.bookedRanges || [],
    onChange: onSelectionChange
  });

  const summaryRow = document.createElement("div");
  summaryRow.className = "summaryRow";

  const pill1 = document.createElement("div");
  pill1.className = "pill";
  pill1.innerHTML = `<div class="k">Select dates</div><div class="v" id="${room.id}-dates">Pick a date range</div>`;

  const pill2 = document.createElement("div");
  pill2.className = "pill";
  pill2.innerHTML = `<div class="k">Summary</div><div class="v" id="${room.id}-sum">Select dates to see availability</div>`;

  summaryRow.append(pill1, pill2);

  const actions = document.createElement("div");
  actions.className = "actions";

  const clearBtn = document.createElement("button");
  clearBtn.className = "btn ghost";
  clearBtn.type = "button";
  clearBtn.textContent = "Clear";

  const bookBtn = document.createElement("button");
  bookBtn.className = "btn primary";
  bookBtn.type = "button";
  bookBtn.textContent = "Book now";
  bookBtn.disabled = true;

  actions.append(clearBtn, bookBtn);

  const errorLine = document.createElement("div");
  errorLine.className = "errorLine";
  errorLine.id = `${room.id}-err`;

  clearBtn.addEventListener("click", ()=>{
    cal.setSelection(null, null);
    onSelectionChange(null, null, "");
  });

  bookBtn.addEventListener("click", ()=>{
    const {start, end} = cal.getSelection();
    // require both dates
    if(!start || !end) return;

    const url = new URL("/checkout.html", window.location.origin);
    url.searchParams.set("room", room.id);
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);
    window.location.href = url.toString();
  });

  function onSelectionChange(startISO, endISO, overlapMsg){
    const datesEl = panel.querySelector(`#${room.id}-dates`);
    const sumEl = panel.querySelector(`#${room.id}-sum`);
    const errEl = panel.querySelector(`#${room.id}-err`);

    // stable layout: only change text
    errEl.textContent = overlapMsg ? overlapMsg : "";

    if(!startISO && !endISO){
      datesEl.textContent = "Pick a date range";
      sumEl.textContent = "Select dates to see availability";
      bookBtn.disabled = true;
      return;
    }

    if(startISO && !endISO){
      datesEl.textContent = `${startISO} → …`;
      sumEl.textContent = "Choose an end date";
      bookBtn.disabled = true;
      return;
    }

    // both dates selected
    datesEl.textContent = `${startISO} → ${endISO}`;

    const nights = nightsBetween(startISO, endISO);
    const total = nights * room.price;
    sumEl.textContent = `${nights} night${nights===1?"":"s"} • ${room.currency}${total}`;

    // disable if overlapping booked
    if(overlapMsg){
      bookBtn.disabled = true;
    }else{
      bookBtn.disabled = false;
    }
  }

  calShell.append(calRoot, summaryRow, actions, errorLine);

  panel.append(titleRow, info, calShell);

  grid.append(carousel, divider, panel);
  card.append(grid);

  return card;
}

async function init(){
  const res = await fetch(ROOMS_URL, { cache: "no-store" });
  const data = await res.json();

  const brandName = document.getElementById("brandName");
  brandName.textContent = data.brand?.name || "Andrew's B&B";
  document.documentElement.style.setProperty("--accent", data.brand?.accent || "#7a0014");
  document.documentElement.style.setProperty("--gold", data.brand?.gold || "#caa04a");

  const rooms = data.rooms || [];

  // thumbnails marquee: duplicate list for seamless loop
  const track = document.getElementById("thumbTrack");
  const accent = data.brand?.accent || "#7a0014";

  const thumbs = rooms.map(r => buildThumb(r, accent));
  const thumbs2 = rooms.map(r => buildThumb(r, accent));

  thumbs.forEach(t => track.appendChild(t));
  thumbs2.forEach(t => track.appendChild(t)); // duplicated

  // room cards
  const roomsEl = document.getElementById("rooms");
  rooms.forEach(room => {
    roomsEl.appendChild(buildRoomCard(room, data.brand || {}));
  });
}

init().catch(console.error);
