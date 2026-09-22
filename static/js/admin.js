/**
 * Digital Bridge — Admin Panel JavaScript
 * Handles Excel upload, guest management, hall rendering for admin.
 */

let adminSeats = [];
let adminGuests = [];

// ================================================================
// Toast Notifications
// ================================================================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ================================================================
// Hall rendering (simplified version for admin)
// ================================================================

const ADMIN_HALL = {
    width: 800, height: 620, padding: 30,
    screenY: 25, screenHeight: 30, screenWidth: 500,
    seatSize: 12, seatGap: 3, rowGap: 4, sectorGap: 40,
    entranceY: 595,
    sectors: {
        left:   { label: 'Левый',       seatsPerRow: 8, rows: 20 },
        center: { label: 'Центральный', seatsPerRow: 9, rows: 20 },
        right:  { label: 'Правый',      seatsPerRow: 8, rows: 20 },
    },
};

function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, val] of Object.entries(attrs)) {
        el.setAttribute(key, val);
    }
    return el;
}

function renderAdminHall(seats) {
    const svg = document.getElementById('admin-hall-svg');
    if (!svg) return;
    svg.innerHTML = '';

    const seatUnit = ADMIN_HALL.seatSize + ADMIN_HALL.seatGap;
    const leftW = ADMIN_HALL.sectors.left.seatsPerRow * seatUnit;
    const centerW = ADMIN_HALL.sectors.center.seatsPerRow * seatUnit;
    const rightW = ADMIN_HALL.sectors.right.seatsPerRow * seatUnit;
    const totalW = leftW + centerW + rightW + 2 * ADMIN_HALL.sectorGap;
    const startX = (ADMIN_HALL.width - totalW) / 2;

    const positions = {
        left:   { x: startX, width: leftW },
        center: { x: startX + leftW + ADMIN_HALL.sectorGap, width: centerW },
        right:  { x: startX + leftW + centerW + 2 * ADMIN_HALL.sectorGap, width: rightW },
    };

    // Background
    svg.appendChild(svgEl('rect', {
        x: 0, y: 0, width: ADMIN_HALL.width, height: ADMIN_HALL.height,
        fill: '#0f172a', rx: 12,
    }));

    // Screen
    const sx = (ADMIN_HALL.width - ADMIN_HALL.screenWidth) / 2;
    svg.appendChild(svgEl('rect', {
        x: sx, y: ADMIN_HALL.screenY, width: ADMIN_HALL.screenWidth, height: ADMIN_HALL.screenHeight,
        fill: '#475569', rx: 6,
    }));
    const sl = svgEl('text', {
        x: ADMIN_HALL.width / 2, y: ADMIN_HALL.screenY + ADMIN_HALL.screenHeight / 2 + 4,
        'text-anchor': 'middle', fill: '#94a3b8', 'font-size': '12', 'font-weight': '600',
    });
    sl.textContent = 'ЭКРАН';
    svg.appendChild(sl);

    const seatsStartY = ADMIN_HALL.screenY + ADMIN_HALL.screenHeight + 35;

    for (const sectorKey of ['left', 'center', 'right']) {
        const conf = ADMIN_HALL.sectors[sectorKey];
        const pos = positions[sectorKey];

        const label = svgEl('text', {
            x: pos.x + pos.width / 2, y: seatsStartY - 12,
            class: 'sector-label',
        });
        label.textContent = conf.label;
        svg.appendChild(label);

        const totalH = conf.rows * (ADMIN_HALL.seatSize + ADMIN_HALL.rowGap);
        svg.appendChild(svgEl('rect', {
            x: pos.x - 6, y: seatsStartY - 4,
            width: pos.width + 12, height: totalH + 8,
            fill: '#1e293b', rx: 8, opacity: 0.5,
        }));

        for (let row = 0; row < conf.rows; row++) {
            const y = seatsStartY + row * (ADMIN_HALL.seatSize + ADMIN_HALL.rowGap);
            for (let num = 0; num < conf.seatsPerRow; num++) {
                const x = pos.x + num * seatUnit;
                const seatData = seats.find(s =>
                    s.sector === sectorKey && s.row === row + 1 && s.number === num + 1
                );
                if (!seatData) continue;

                const rect = svgEl('rect', {
                    x, y,
                    width: ADMIN_HALL.seatSize, height: ADMIN_HALL.seatSize,
                    class: seatData.is_occupied ? 'seat seat-occupied' : 'seat seat-free',
                    rx: 3,
                });

                const title = svgEl('title', {});
                title.textContent = seatData.is_occupied
                    ? `${seatData.guest_name} — Ряд ${seatData.row}, Место ${seatData.number}`
                    : `Свободно — Ряд ${seatData.row}, Место ${seatData.number}`;
                rect.appendChild(title);
                svg.appendChild(rect);
            }
        }

        // Aisle
        const aisleY = seatsStartY + 10 * (ADMIN_HALL.seatSize + ADMIN_HALL.rowGap) - ADMIN_HALL.rowGap / 2;
        svg.appendChild(svgEl('line', {
            x1: pos.x - 6, y1: aisleY,
            x2: pos.x + pos.width + 6, y2: aisleY,
            stroke: '#334155', 'stroke-width': 1, 'stroke-dasharray': '4 3',
        }));
    }

    // Entrances
    const entPositions = {
        A: positions.left.x + positions.left.width / 2,
        'Б': positions.center.x + positions.center.width / 2,
        'В': positions.right.x + positions.right.width / 2,
    };
    for (const [id, ex] of Object.entries(entPositions)) {
        svg.appendChild(svgEl('rect', {
            x: ex - 25, y: ADMIN_HALL.entranceY - 10,
            width: 50, height: 22, fill: '#f97316', rx: 6,
        }));
        const el = svgEl('text', {
            x: ex, y: ADMIN_HALL.entranceY + 5,
            'text-anchor': 'middle', fill: 'white', 'font-size': '10', 'font-weight': '700',
        });
        el.textContent = `Вход ${id}`;
        svg.appendChild(el);
    }
}

// ================================================================
// Data loading
// ================================================================

async function loadAdminData() {
    try {
        const [seatsResp, guestsResp] = await Promise.all([
            fetch('/api/seats'),
            fetch('/admin/guests'),
        ]);

        adminSeats = await seatsResp.json();
        adminGuests = await guestsResp.json();

        renderAdminHall(adminSeats);
        renderGuestTable(adminGuests);
        populateSelects();
        updateAdminStats();
    } catch (err) {
        console.error('Failed to load admin data:', err);
    }
}

function updateAdminStats() {
    const el = document.getElementById('admin-occupied');
    if (el) {
        const occupied = adminSeats.filter(s => s.is_occupied).length;
        el.textContent = occupied;
    }
}

// ================================================================
// Guest table
// ================================================================

function renderGuestTable(guests) {
    const tbody = document.getElementById('guest-table-body');
    if (!tbody) return;

    if (guests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">Нет гостей</td></tr>';
        return;
    }

    tbody.innerHTML = guests.map(g => `
        <tr class="border-b border-gray-700/50 hover:bg-gray-800/50 transition-colors guest-row" data-name="${g.name?.toLowerCase() || ''}">
            <td class="px-4 py-2.5 text-white font-medium">${g.name || '—'}</td>
            <td class="px-4 py-2.5 text-gray-300">${g.sector_label || '—'}</td>
            <td class="px-4 py-2.5 text-gray-300">${g.row ?? '—'}</td>
            <td class="px-4 py-2.5 text-gray-300">${g.number ?? '—'}</td>
            <td class="px-4 py-2.5">
                ${g.seat_id ? `<button onclick="removeSeatAssignment(${g.seat_id})" class="text-red-400 hover:text-red-300 text-xs transition-colors">Снять с места</button>` : '<span class="text-gray-600 text-xs">не назначен</span>'}
            </td>
        </tr>
    `).join('');
}

// ================================================================
// Move guest selects
// ================================================================

function populateSelects() {
    const sourceSelect = document.getElementById('move-source');
    const targetSelect = document.getElementById('move-target');
    if (!sourceSelect || !targetSelect) return;

    // Source: occupied seats
    const occupied = adminSeats.filter(s => s.is_occupied);
    sourceSelect.innerHTML = '<option value="">Откуда (выберите гостя)</option>' +
        occupied.map(s =>
            `<option value="${s.id}">${s.guest_name} — ${s.sector_label}, Р${s.row} М${s.number}</option>`
        ).join('');

    // Target: all seats
    targetSelect.innerHTML = '<option value="">Куда (выберите место)</option>' +
        adminSeats.map(s => {
            const label = s.is_occupied
                ? `${s.sector_label}, Р${s.row} М${s.number} (${s.guest_name})`
                : `${s.sector_label}, Р${s.row} М${s.number} (свободно)`;
            return `<option value="${s.id}">${label}</option>`;
        }).join('');
}

// ================================================================
// Actions
// ================================================================

async function moveGuest() {
    const sourceId = document.getElementById('move-source').value;
    const targetId = document.getElementById('move-target').value;

    if (!sourceId || !targetId) {
        showToast('Выберите откуда и куда переместить гостя', 'error');
        return;
    }

    if (sourceId === targetId) {
        showToast('Нельзя переместить на то же место', 'error');
        return;
    }

    try {
        const resp = await fetch('/admin/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source_seat_id: parseInt(sourceId),
                target_seat_id: parseInt(targetId),
            }),
        });

        const data = await resp.json();
        if (data.success) {
            showToast('Гость перемещён', 'success');
            await loadAdminData();
        } else {
            showToast(data.detail || 'Ошибка', 'error');
        }
    } catch (err) {
        showToast('Ошибка соединения', 'error');
    }
}

async function removeSeatAssignment(seatId) {
    try {
        const resp = await fetch('/admin/assign-single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seat_id: seatId }),
        });

        const data = await resp.json();
        if (data.success) {
            showToast('Гость снят с места (QR сохранён)', 'success');
            await loadAdminData();
        }
    } catch (err) {
        showToast('Ошибка', 'error');
    }
}

async function clearAll() {
    if (!confirm('Вы уверены? Все назначения гостей будут удалены.')) return;

    try {
        const resp = await fetch('/admin/clear', { method: 'POST' });
        const data = await resp.json();
        if (data.success) {
            showToast('Все назначения очищены', 'success');
            await loadAdminData();
        }
    } catch (err) {
        showToast('Ошибка', 'error');
    }
}

// ================================================================
// Excel Upload
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('file-input');
    const uploadForm = document.getElementById('upload-form');
    const uploadBtn = document.getElementById('upload-btn');
    const fileNameDisplay = document.getElementById('file-name');
    const dropZone = document.getElementById('drop-zone');
    const resultDiv = document.getElementById('upload-result');

    if (fileInput) {
        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                fileNameDisplay.textContent = this.files[0].name;
                fileNameDisplay.classList.remove('hidden');
                uploadBtn.disabled = false;
            }
        });
    }

    // Drag and drop
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                fileInput.files = e.dataTransfer.files;
                fileNameDisplay.textContent = e.dataTransfer.files[0].name;
                fileNameDisplay.classList.remove('hidden');
                uploadBtn.disabled = false;
            }
        });
    }

    // Upload form submit
    if (uploadForm) {
        uploadForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            if (!fileInput.files.length) {
                showToast('Выберите файл', 'error');
                return;
            }

            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Загрузка...';

            const formData = new FormData();
            formData.append('file', fileInput.files[0]);

            try {
                const resp = await fetch('/admin/upload', {
                    method: 'POST',
                    body: formData,
                });

                const data = await resp.json();

                if (data.success) {
                    resultDiv.classList.remove('hidden');
                    resultDiv.innerHTML = `
                        <div class="bg-green-900/50 border border-green-600 rounded-lg p-3 text-sm">
                            <p class="text-green-300 font-medium">${data.message}</p>
                            ${data.warning ? `<p class="text-yellow-300 mt-1">⚠ ${data.warning}</p>` : ''}
                        </div>
                    `;
                    showToast(data.message, 'success');
                    await loadAdminData();
                } else {
                    resultDiv.classList.remove('hidden');
                    resultDiv.innerHTML = `
                        <div class="bg-red-900/50 border border-red-600 rounded-lg p-3 text-sm">
                            <p class="text-red-300">${data.detail || 'Ошибка'}</p>
                        </div>
                    `;
                    showToast(data.detail || 'Ошибка загрузки', 'error');
                }
            } catch (err) {
                showToast('Ошибка соединения', 'error');
            } finally {
                uploadBtn.disabled = false;
                uploadBtn.textContent = 'Загрузить и распределить';
            }
        });
    }

    // Search filter
    const searchInput = document.getElementById('guest-search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            document.querySelectorAll('.guest-row').forEach(row => {
                const name = row.getAttribute('data-name') || '';
                row.style.display = name.includes(query) ? '' : 'none';
            });
        });
    }

    // Initial load
    loadAdminData();
});
