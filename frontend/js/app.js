
let currentDetectionResult = null;
let currentSource = null;
let currentViewMode = 'annotated';

let zoomScale = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const modelSelect = document.getElementById('modelSelect');
const confRange = document.getElementById('confRange');
const confVal = document.getElementById('confVal');
const iouRange = document.getElementById('iouRange');
const iouVal = document.getElementById('iouVal');
const reRunBtn = document.getElementById('reRunBtn');
const samplesCarousel = document.getElementById('samplesCarousel');

const viewportStage = document.getElementById('viewportStage');
const stageContainer = document.getElementById('stageContainer');
const mainDisplayImg = document.getElementById('mainDisplayImg');
const splitViewContainer = document.getElementById('splitViewContainer');
const splitOriginalImg = document.getElementById('splitOriginalImg');
const splitAnnotatedImg = document.getElementById('splitAnnotatedImg');
const scannerLaser = document.getElementById('scannerLaser');
const processingOverlay = document.getElementById('processingOverlay');
const emptyState = document.getElementById('emptyState');

const verdictBanner = document.getElementById('verdictBanner');
const verdictIcon = document.getElementById('verdictIcon');
const verdictTitle = document.getElementById('verdictTitle');
const verdictSub = document.getElementById('verdictSub');
const metricDefectCount = document.getElementById('metricDefectCount');
const metricInferenceTime = document.getElementById('metricInferenceTime');
const metricFps = document.getElementById('metricFps');
const cropsGallery = document.getElementById('cropsGallery');
const defectTableBody = document.getElementById('defectTableBody');
const defectCountBadge = document.getElementById('defectCountBadge');

const imageNameBadge = document.getElementById('imageNameBadge');
const imageDimBadge = document.getElementById('imageDimBadge');

document.addEventListener('DOMContentLoaded', () => {
  initSystem();
  setupEventListeners();
});

async function initSystem() {
  try {

    if (confRange && confVal) {
      confRange.value = 50;
      confVal.textContent = '50%';
    }

    const statusRes = await fetch('/api/status');
    const statusData = await statusRes.json();

    const modelsRes = await fetch('/api/models');
    const modelsData = await modelsRes.json();
    modelSelect.innerHTML = '';
    modelsData.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.path;
      opt.textContent = `${m.name} (${m.size_mb} MB)`;
      if (m.path === modelsData.active_model) {
        opt.selected = true;
      }
      modelSelect.appendChild(opt);
    });

    const statsRes = await fetch('/api/dataset-stats');
    const statsData = await statsRes.json();
    document.getElementById('statTrainCount').textContent = statsData.train_count;
    document.getElementById('statValCount').textContent = statsData.valid_count;

    await loadSamples();

  } catch (err) {
    console.error('Initialization error:', err);
  }
}

async function loadSamples() {
  try {
    const res = await fetch('/api/samples');
    const data = await res.json();
    samplesCarousel.innerHTML = '';

    if (!data.samples || data.samples.length === 0) {
      samplesCarousel.innerHTML = '<span style="color:var(--text-dim);font-size:0.8rem;">ไม่พบภาพตัวอย่าง</span>';
      return;
    }

    data.samples.forEach((sample, idx) => {
      const card = document.createElement('div');
      card.className = 'sample-thumb-card';
      card.title = `คลิกเพื่อตรวจสอบ: ${sample.filename}`;
      card.innerHTML = `
        <img class="sample-thumb-img" src="/api/sample-image/${encodeURIComponent(sample.filename)}" alt="PCB" loading="lazy">
        <span class="sample-thumb-name">${sample.filename.replace('_jpg.rf.', '..')}</span>
      `;
      card.addEventListener('click', () => {
        document.querySelectorAll('.sample-thumb-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        currentSource = { type: 'sample', filename: sample.filename };
        runDetection();
      });
      samplesCarousel.appendChild(card);
    });

    if (data.samples.length > 0 && !currentSource) {
      const firstCard = samplesCarousel.querySelector('.sample-thumb-card');
      if (firstCard) {
        firstCard.classList.add('active');
        currentSource = { type: 'sample', filename: data.samples[0].filename };
        runDetection();
      }
    }

  } catch (err) {
    console.error('Error loading samples:', err);
  }
}

function setupEventListeners() {

  confRange.addEventListener('input', (e) => {
    confVal.textContent = `${e.target.value}%`;
  });
  iouRange.addEventListener('input', (e) => {
    iouVal.textContent = `${e.target.value}%`;
  });

  reRunBtn.addEventListener('click', () => {
    if (currentSource) {
      runDetection();
    }
  });

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  });

  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        handleSelectedFile(blob);
        break;
      }
    }
  });

  const modeBtns = document.querySelectorAll('#viewModeGroup .mode-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentViewMode = btn.dataset.mode;
      renderCurrentView();
    });
  });

  document.getElementById('zoomInBtn').addEventListener('click', () => updateZoom(0.25));
  document.getElementById('zoomOutBtn').addEventListener('click', () => updateZoom(-0.25));
  document.getElementById('resetZoomBtn').addEventListener('click', resetZoom);

  viewportStage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    updateZoom(delta);
  }, { passive: false });

  viewportStage.addEventListener('mousedown', (e) => {
    if (zoomScale > 1) {
      isPanning = true;
      startPanX = e.clientX - panX;
      startPanY = e.clientY - panY;
      viewportStage.classList.add('grabbing');
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panX = e.clientX - startPanX;
    panY = e.clientY - startPanY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    isPanning = false;
    viewportStage.classList.remove('grabbing');
  });

  document.getElementById('downloadAnnotatedBtn').addEventListener('click', downloadAnnotatedImage);
  document.getElementById('exportJsonBtn').addEventListener('click', exportJsonData);
}

function handleSelectedFile(file) {
  document.querySelectorAll('.sample-thumb-card').forEach(c => c.classList.remove('active'));
  currentSource = { type: 'file', file: file, name: file.name };
  runDetection();
}

async function runDetection() {
  if (!currentSource) return;

  processingOverlay.style.display = 'flex';
  scannerLaser.classList.add('scanning');
  emptyState.style.display = 'none';

  const formData = new FormData();
  formData.append('conf_thresh', (parseFloat(confRange.value) / 100).toString());
  formData.append('iou_thresh', (parseFloat(iouRange.value) / 100).toString());
  if (modelSelect.value) {
    formData.append('model_path', modelSelect.value);
  }

  if (currentSource.type === 'sample') {
    formData.append('sample_filename', currentSource.filename);
  } else if (currentSource.type === 'file') {
    formData.append('file', currentSource.file);
  }

  try {
    const res = await fetch('/api/detect', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'การตรวจสอบล้มเหลว');
    }

    const data = await res.json();
    currentDetectionResult = data;
    displayResults(data);

  } catch (err) {
    alert('เกิดข้อผิดพลาดในการตรวจสอบ: ' + err.message);
    console.error(err);
  } finally {
    processingOverlay.style.display = 'none';
    scannerLaser.classList.remove('scanning');
  }
}

function displayResults(data) {

  imageNameBadge.textContent = data.filename || 'PCB Image';
  imageDimBadge.textContent = `${data.dimensions.width} × ${data.dimensions.height} px`;

  verdictBanner.className = 'verdict-banner ' + (data.is_pass ? 'pass' : 'defect');
  if (data.is_pass) {
    verdictIcon.textContent = '✅';
    verdictTitle.textContent = 'PCB PASS (สมบูรณ์)';
    verdictSub.textContent = 'ไม่พบข้อบกพร่องตามระดับความไวที่กำหนด';
  } else {
    verdictIcon.textContent = '⚠️';
    verdictTitle.textContent = `DEFECT DETECTED (พบ ${data.defect_count} จุด)`;
    verdictSub.textContent = `พบข้อบกพร่องประเภท Missing Hole จำนวน ${data.defect_count} แห่ง`;
  }

  metricDefectCount.textContent = data.defect_count;
  metricInferenceTime.textContent = data.timing.inference_ms;
  metricFps.textContent = data.timing.fps;
  defectCountBadge.textContent = `${data.defect_count} จุด`;

  renderCrops(data.patches);

  renderTable(data.defects);

  renderCurrentView();
}

function renderCurrentView() {
  if (!currentDetectionResult) return;

  const data = currentDetectionResult;
  emptyState.style.display = 'none';

  if (currentViewMode === 'split') {
    mainDisplayImg.style.display = 'none';
    splitViewContainer.style.display = 'flex';
    splitOriginalImg.src = data.original_image;
    splitAnnotatedImg.src = data.annotated_image;
  } else {
    splitViewContainer.style.display = 'none';
    mainDisplayImg.style.display = 'block';
    mainDisplayImg.src = (currentViewMode === 'original') ? data.original_image : data.annotated_image;
  }
}

function renderCrops(patches) {
  cropsGallery.innerHTML = '';

  if (!patches || patches.length === 0) {
    cropsGallery.innerHTML = '<p class="empty-crops-msg">ไม่พบจุดบกพร่องในภาพนี้</p>';
    return;
  }

  patches.forEach(p => {
    const card = document.createElement('div');
    card.className = 'crop-card';
    card.title = `จุดที่ #${p.id} (${p.confidence}%) พิกัด: [${p.box.join(', ')}]`;
    card.innerHTML = `
      <img class="crop-img" src="${p.image_b64}" alt="Defect #${p.id}">
      <div class="crop-info">
        <span class="crop-id">#${p.id}</span>
        <span class="crop-conf">${p.confidence}%</span>
      </div>
    `;

    card.addEventListener('mouseenter', () => highlightTableRow(p.id));
    card.addEventListener('mouseleave', () => unhighlightTableRow(p.id));
    cropsGallery.appendChild(card);
  });
}

function renderTable(defects) {
  defectTableBody.innerHTML = '';

  if (!defects || defects.length === 0) {
    defectTableBody.innerHTML = '<tr><td colspan="5" class="empty-td">ผ่านการตรวจสอบ (ไม่มีข้อบกพร่อง)</td></tr>';
    return;
  }

  defects.forEach(d => {
    const tr = document.createElement('tr');
    tr.id = `defect-row-${d.id}`;
    tr.innerHTML = `
      <td><strong>#${d.id}</strong></td>
      <td><span class="tag-red">${d.class_name}</span></td>
      <td>${(d.confidence * 100).toFixed(1)}%</td>
      <td>(${d.cx}, ${d.cy})</td>
      <td>${d.width}×${d.height}</td>
    `;
    defectTableBody.appendChild(tr);
  });
}

function highlightTableRow(id) {
  const row = document.getElementById(`defect-row-${id}`);
  if (row) {
    row.classList.add('highlighted');
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function unhighlightTableRow(id) {
  const row = document.getElementById(`defect-row-${id}`);
  if (row) {
    row.classList.remove('highlighted');
  }
}

function updateZoom(delta) {
  zoomScale = Math.min(Math.max(0.6, zoomScale + delta), 4.0);
  applyTransform();
}

function resetZoom() {
  zoomScale = 1;
  panX = 0;
  panY = 0;
  applyTransform();
}

function applyTransform() {
  stageContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
}

function downloadAnnotatedImage() {
  if (!currentDetectionResult) return;
  const link = document.createElement('a');
  link.download = `PCB_Defect_${currentDetectionResult.filename || 'annotated'}.jpg`;
  link.href = currentDetectionResult.annotated_image;
  link.click();
}

function exportJsonData() {
  if (!currentDetectionResult) return;
  const jsonStr = JSON.stringify(currentDetectionResult, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `PCB_Defect_Report_${Date.now()}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
