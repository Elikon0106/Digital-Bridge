/**
 * Digital Bridge — Interactive Hall SVG Renderer
 * Generates an SVG seating chart for the main hall page.
 */

// Hall layout constants
const HALL = {
    width: 800,
    height: 620,
    padding: 30,
    screenY: 25,
    screenHeight: 30,
    screenWidth: 500,
    seatSize: 12,
    seatGap: 3,
    rowGap: 4,
    sectorGap: 40,
    entranceY: 595,
    sectors: {
        left:   { label: 'Левый',        seatsPerRow: 8,  rows: 20 },
        center: { label: 'Центральный',  seatsPerRow: 9,  rows: 20 },
        right:  { label: 'Правый',       seatsPerRow: 8,  rows: 20 },
    },
    entrances: [
        { id: 'A', label: 'Вход A', sector: 'left' },
        { id: 'Б', label: 'Вход Б', sector: 'center' },
        { id: 'В', label: 'Вход В', sector: 'right' },
    ],
};

let allSeats = [];
let selectedSeatId = null;

/**
 * Calculate X positions for each sector.
 */
function calculateSectorPositions() {
    const seatUnit = HALL.seatSize + HALL.seatGap;
    const leftWidth = HALL.sectors.left.seatsPerRow * seatUnit;
    const centerWidth = HALL.sectors.center.seatsPerRow * seatUnit;
    const rightWidth = HALL.sectors.right.seatsPerRow * seatUnit;
    const totalWidth = leftWidth + centerWidth + rightWidth + 2 * HALL.sectorGap;
    const startX = (HALL.width - totalWidth) / 2;

    return {
        left:   { x: startX, width: leftWidth },
        center: { x: startX + leftWidth + HALL.sectorGap, width: centerWidth },
        right:  { x: startX + leftWidth + centerWidth + 2 * HALL.sectorGap, width: rightWidth },
    };
}

/**
 * Create an SVG element with attributes.
 */
function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, val] of Object.entries(attrs)) {
        el.setAttribute(key, val);
    }
    return el;
}

/**
 * Render the hall SVG with all seats.
 */
function renderHall(svgId, seats) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    svg.innerHTML = '';

    const positions = calculateSectorPositions();
    const seatUnit = HALL.seatSize + HALL.seatGap;

    // Background
    svg.appendChild(svgEl('rect', {
        x: 0, y: 0, width: HALL.width, height: HALL.height,
        fill: '#0f172a', rx: 12,
    }));

    // Screen
    const screenX = (HALL.width - HALL.screenWidth) / 2;
    svg.appendChild(svgEl('rect', {
        x: screenX, y: HALL.screenY, width: HALL.screenWidth, height: HALL.screenHeight,
        class: 'hall-screen', fill: '#475569', rx: 6,
    }));
    const screenLabel = svgEl('text', {
        x: HALL.width / 2, y: HALL.screenY + HALL.screenHeight / 2 + 4,
        'text-anchor': 'middle', fill: '#94a3b8', 'font-size': '12', 'font-weight': '600',
    });
    screenLabel.textContent = 'ЭКРАН';
    svg.appendChild(screenLabel);

    // Starting Y for seats (below screen)
    const seatsStartY = HALL.screenY + HALL.screenHeight + 35;

    // Draw sectors
    const sectorOrder = ['left', 'center', 'right'];
    const seatElements = {};

    for (const sectorKey of sectorOrder) {
        const sectorConf = HALL.sectors[sectorKey];
        const pos = positions[sectorKey];

        // Sector label
        const label = svgEl('text', {
            x: pos.x + pos.width / 2,
            y: seatsStartY - 12,
            class: 'sector-label',
        });
        label.textContent = sectorConf.label;
        svg.appendChild(label);

        // Sector background
        const totalRowHeight = sectorConf.rows * (HALL.seatSize + HALL.rowGap);
        svg.appendChild(svgEl('rect', {
            x: pos.x - 6, y: seatsStartY - 4,
            width: pos.width + 12, height: totalRowHeight + 8,
            fill: '#1e293b', rx: 8, opacity: 0.5,
        }));

        // Seats
        for (let row = 0; row < sectorConf.rows; row++) {
            const y = seatsStartY + row * (HALL.seatSize + HALL.rowGap);

            // Row label
            if (sectorKey === 'left') {
                const rl = svgEl('text', {
                    x: pos.x - 14, y: y + HALL.seatSize / 2,
                    class: 'row-label',
                });
                rl.textContent = row + 1;
                svg.appendChild(rl);
            }

            for (let num = 0; num < sectorConf.seatsPerRow; num++) {
                const x = pos.x + num * seatUnit;

                // Find matching seat data
                const seatData = seats.find(s =>
                    s.sector === sectorKey &&
                    s.row === row + 1 &&
                    s.number === num + 1
                );

                if (!seatData) continue;

                const rect = svgEl('rect', {
                    x: x, y: y,
                    width: HALL.seatSize, height: HALL.seatSize,
                    class: seatData.is_occupied ? 'seat seat-occupied' : 'seat seat-free',
                    rx: 3,
                    'data-seat-id': seatData.id,
                });

                // Tooltip
                const title = svgEl('title', {});
                title.textContent = seatData.is_occupied
                    ? `${seatData.guest_name} — ${seatData.sector_label}, Ряд ${seatData.row}, Место ${seatData.number}`
                    : `Свободно — ${seatData.sector_label}, Ряд ${seatData.row}, Место ${seatData.number}`;
                rect.appendChild(title);

                rect.addEventListener('click', () => selectSeat(seatData.id));
                svg.appendChild(rect);
                seatElements[seatData.id] = rect;
            }
        }

        // Aisle between rows 10 and 11
        const aisleY = seatsStartY + 10 * (HALL.seatSize + HALL.rowGap) - HALL.rowGap / 2;
        svg.appendChild(svgEl('line', {
            x1: pos.x - 6, y1: aisleY,
            x2: pos.x + pos.width + 6, y2: aisleY,
            stroke: '#334155', 'stroke-width': 1, 'stroke-dasharray': '4 3',
        }));
    }

    // Entrances
    const entrancePositions = {
        A: positions.left.x + positions.left.width / 2,
        'Б': positions.center.x + positions.center.width / 2,
        'В': positions.right.x + positions.right.width / 2,
    };

    for (const ent of HALL.entrances) {
        const ex = entrancePositions[ent.id];

        // Entrance arrow
        svg.appendChild(svgEl('rect', {
            x: ex - 25, y: HALL.entranceY - 10,
            width: 50, height: 22,
            class: 'entrance-marker', rx: 6,
        }));

        const entLabel = svgEl('text', {
            x: ex, y: HALL.entranceY + 5,
            'text-anchor': 'middle', fill: 'white', 'font-size': '10', 'font-weight': '700',
        });
        entLabel.textContent = ent.label;
        svg.appendChild(entLabel);
    }

    return seatElements;
}

/**
 * Select a seat and show its details in the side panel.
 */
async function selectSeat(seatId) {
    // Remove previous selection
    const prevSelected = document.querySelector('.seat-selected');
    if (prevSelected) {
        const prevData = allSeats.find(s => s.id === parseInt(prevSelected.getAttribute('data-seat-id')));
        if (prevData) {
            prevSelected.setAttribute('class', prevData.is_occupied ? 'seat seat-occupied' : 'seat seat-free');
        }
    }

    // Highlight new selection
    const seatEl = document.querySelector(`[data-seat-id="${seatId}"]`);
    if (seatEl) {
        seatEl.setAttribute('class', 'seat seat-selected');
    }

    selectedSeatId = seatId;

    // Fetch seat details
    try {
        const response = await fetch(`/api/seat/${seatId}`);
        const data = await response.json();
        showSeatPanel(data);
    } catch (err) {
        console.error('Failed to fetch seat info:', err);
    }
}

/**
 * Show seat details in the right panel.
 */
function showSeatPanel(data) {
    const panel = document.getElementById('side-panel');
    const content = document.getElementById('panel-content');

    panel.classList.remove('hidden-panel');
    panel.classList.add('visible-panel');

    content.innerHTML = `
        <div class="space-y-5">
            <!-- Guest info -->
            <div class="bg-gray-800 rounded-xl p-4">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center ${data.is_occupied ? 'bg-blue-600/30' : 'bg-gray-700'}">
                        <svg class="w-5 h-5 ${data.is_occupied ? 'text-blue-400' : 'text-gray-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                        </svg>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400">Гость</p>
                        <p class="text-white font-semibold">${data.guest_name || 'Не назначен'}</p>
                    </div>
                </div>
            </div>

            <!-- Seat location -->
            <div class="bg-gray-800 rounded-xl p-4">
                <p class="text-xs text-gray-400 mb-3">Расположение</p>
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="bg-gray-700/50 rounded-lg p-2">
                        <p class="text-gray-400 text-xs">Сектор</p>
                        <p class="text-white font-semibold text-sm">${data.sector_label}</p>
                    </div>
                    <div class="bg-gray-700/50 rounded-lg p-2">
                        <p class="text-gray-400 text-xs">Ряд</p>
                        <p class="text-white font-semibold text-lg">${data.row}</p>
                    </div>
                    <div class="bg-gray-700/50 rounded-lg p-2">
                        <p class="text-gray-400 text-xs">Место</p>
                        <p class="text-white font-semibold text-lg">${data.number}</p>
                    </div>
                </div>
            </div>

            <!-- QR Code (only if guest assigned) -->
            ${data.qr_image ? `
            <div class="bg-gray-800 rounded-xl p-4 text-center">
                <p class="text-xs text-gray-400 mb-1">Персональный QR-код гостя</p>
                <p class="text-xs text-gray-500 mb-3">Не меняется при пересадке</p>
                <div class="qr-container mx-auto mb-3">
                    <img src="${data.qr_image}" alt="QR" class="w-36 h-36">
                </div>
                <p class="text-gray-500 text-xs break-all">${data.qr_url}</p>
            </div>
            ` : `
            <div class="bg-gray-800 rounded-xl p-4 text-center">
                <p class="text-xs text-gray-500">QR-код появится после назначения гостя</p>
            </div>
            `}

            <!-- Status badge -->
            <div class="text-center">
                <span class="inline-block px-4 py-1.5 rounded-full text-sm font-medium ${
                    data.is_occupied
                        ? 'bg-blue-600/20 text-blue-300 border border-blue-600/30'
                        : 'bg-green-600/20 text-green-300 border border-green-600/30'
                }">
                    ${data.is_occupied ? '● Занято' : '○ Свободно'}
                </span>
            </div>
        </div>
    `;
}

/**
 * Close the side panel.
 */
function closePanel() {
    const panel = document.getElementById('side-panel');
    panel.classList.add('hidden-panel');
    panel.classList.remove('visible-panel');

    // Deselect seat
    const selected = document.querySelector('.seat-selected');
    if (selected && selectedSeatId) {
        const data = allSeats.find(s => s.id === selectedSeatId);
        if (data) {
            selected.setAttribute('class', data.is_occupied ? 'seat seat-occupied' : 'seat seat-free');
        }
    }
    selectedSeatId = null;
}

/**
 * Update statistics display.
 */
function updateStats(seats) {
    const occupied = seats.filter(s => s.is_occupied).length;
    const free = seats.length - occupied;
    const freeEl = document.getElementById('stats-free');
    const occEl = document.getElementById('stats-occupied');
    if (freeEl) freeEl.textContent = free;
    if (occEl) occEl.textContent = occupied;
}

/**
 * Load all seats and render the hall.
 */
async function loadHall() {
    try {
        const response = await fetch('/api/seats');
        allSeats = await response.json();
        renderHall('hall-svg', allSeats);
        updateStats(allSeats);
    } catch (err) {
        console.error('Failed to load hall data:', err);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', loadHall);
