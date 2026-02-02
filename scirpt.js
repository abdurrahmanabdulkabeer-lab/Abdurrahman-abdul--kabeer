// Simple paint app with brush/eraser, undo/redo, save, size and color controls
(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: false });

  const colorPicker = document.getElementById('colorPicker');
  const sizeRange = document.getElementById('sizeRange');
  const brushBtn = document.getElementById('brushBtn');
  const eraserBtn = document.getElementById('eraserBtn');
  const clearBtn = document.getElementById('clearBtn');
  const saveBtn = document.getElementById('saveBtn');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');

  // State
  let drawing = false;
  let lastPoint = null;
  let tool = 'brush'; // 'brush' or 'eraser'
  let color = colorPicker.value;
  let size = Number(sizeRange.value);
  const undoStack = [];
  const redoStack = [];
  const MAX_STEPS = 30;

  // Canvas high-dpi setup
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const newWidth = Math.round(rect.width * dpr);
    const newHeight = Math.round(rect.height * dpr);

    // Save current canvas to temp image
    const temp = document.createElement('canvas');
    temp.width = canvas.width;
    temp.height = canvas.height;
    temp.getContext('2d').drawImage(canvas, 0, 0);

    canvas.width = newWidth;
    canvas.height = newHeight;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // redraw saved content (scale automatically because we used device pixels before)
    if (temp.width && temp.height) {
      ctx.drawImage(temp, 0, 0, temp.width / dpr, temp.height / dpr);
    } else {
      // initial background white
      fillBackgroundWhite();
    }
  }

  function fillBackgroundWhite() {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Initialize
  function init() {
    window.addEventListener('resize', debounce(resizeCanvas, 120));
    resizeCanvas();
    setBrush();
    attachPointerEvents();
    attachUI();
    pushUndo(); // initial state as blank
  }

  // Debounce helper
  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // Tools
  function setBrush() {
    tool = 'brush';
    brushBtn.classList.add('active');
    brushBtn.setAttribute('aria-pressed', 'true');
    eraserBtn.classList.remove('active');
    eraserBtn.setAttribute('aria-pressed', 'false');
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
  }
  function setEraser() {
    tool = 'eraser';
    eraserBtn.classList.add('active');
    eraserBtn.setAttribute('aria-pressed', 'true');
    brushBtn.classList.remove('active');
    brushBtn.setAttribute('aria-pressed', 'false');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  }

  // Drawing primitives
  function startDrawing(point) {
    drawing = true;
    lastPoint = point;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = size;
    if (tool === 'brush') ctx.strokeStyle = color;
    else ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function drawTo(point) {
    if (!drawing) return;
    // draw a smooth line using quadratic curve
    const midX = (lastPoint.x + point.x) / 2;
    const midY = (lastPoint.y + point.y) / 2;
    ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midX, midY);
    ctx.stroke();
    lastPoint = point;
  }

  function endDrawing() {
    if (!drawing) return;
    drawing = false;
    ctx.closePath();
    pushUndo();
    // clear redo stack after new action
    redoStack.length = 0;
    updateUndoRedoButtons();
  }

  // Undo stack using dataURL snapshots
  function pushUndo() {
    try {
      const dataURL = canvas.toDataURL('image/png');
      undoStack.push(dataURL);
      if (undoStack.length > MAX_STEPS) undoStack.shift();
      updateUndoRedoButtons();
    } catch (e) {
      // ignore
    }
  }

  function restoreFromDataURL(dataURL) {
    const img = new Image();
    img.onload = () => {
      // clear canvas and draw image
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // ensure white background beneath image
      fillBackgroundWhite();
      ctx.drawImage(img, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
    };
    img.src = dataURL;
  }

  function undo() {
    if (undoStack.length <= 1) return;
    const last = undoStack.pop();
    redoStack.push(last);
    const prev = undoStack[undoStack.length - 1];
    if (prev) restoreFromDataURL(prev);
    updateUndoRedoButtons();
  }

  function redo() {
    if (redoStack.length === 0) return;
    const next = redoStack.pop();
    undoStack.push(next);
    restoreFromDataURL(next);
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    undoBtn.disabled = undoStack.length <= 1;
    redoBtn.disabled = redoStack.length === 0;
  }

  // Attach pointer events (works for mouse, touch, pen)
  function attachPointerEvents() {
    // Use pointer events and set pointer capture for smooth drawing
    canvas.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      canvas.setPointerCapture(ev.pointerId);
      const p = getPoint(ev);
      startDrawing(p);
    });

    canvas.addEventListener('pointermove', (ev) => {
      if (!drawing) return;
      ev.preventDefault();
      const p = getPoint(ev);
      drawTo(p);
    });

    canvas.addEventListener('pointerup', (ev) => {
      if (!drawing) return;
      ev.preventDefault();
      canvas.releasePointerCapture(ev.pointerId);
      endDrawing();
    });

    canvas.addEventListener('pointercancel', (ev) => {
      if (!drawing) return;
      ev.preventDefault();
      canvas.releasePointerCapture(ev.pointerId);
      endDrawing();
    });

    // Prevent default gestures
    canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  }

  // Get coordinate relative to canvas drawing coordinate system
  function getPoint(ev) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    // Use clientX/Y then convert to CSS coordinates then to canvas coordinates
    const x = (ev.clientX - rect.left) * (canvas.width / rect.width) / dpr;
    const y = (ev.clientY - rect.top) * (canvas.height / rect.height) / dpr;
    return { x, y };
  }

  // UI
  function attachUI() {
    colorPicker.addEventListener('input', (e) => {
      color = e.target.value;
      if (tool === 'brush') ctx.strokeStyle = color;
    });

    sizeRange.addEventListener('input', (e) => {
      size = Number(e.target.value);
      ctx.lineWidth = size;
    });

    brushBtn.addEventListener('click', setBrush);
    eraserBtn.addEventListener('click', setEraser);

    clearBtn.addEventListener('click', () => {
      pushUndo();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      fillBackgroundWhite();
      redoStack.length = 0;
      updateUndoRedoButtons();
    });

    saveBtn.addEventListener('click', () => {
      // create a full-resolution PNG (account for devicePixelRatio)
      const dpr = Math.max(window.devicePixelRatio || 1, 1);
      // Create an offscreen canvas with logical pixel size
      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height;
      const outCtx = out.getContext('2d');
      // white background
      outCtx.fillStyle = '#ffffff';
      outCtx.fillRect(0, 0, out.width, out.height);
      // draw the current content scaled up
      outCtx.drawImage(canvas, 0, 0, out.width, out.height);
      out.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'drawing.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }, 'image/png');
    });

    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);

    // keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'b' || e.key === 'B') setBrush();
      else if (e.key === 'e' || e.key === 'E') setEraser();
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); }
    });

    updateUndoRedoButtons();
  }

  // Start with white background
  fillBackgroundWhite();

  init();
})();
