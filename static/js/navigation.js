/**
 * Digital Bridge — Navigation Hall Renderer
 * Renders a mini hall map with highlighted path from entrance to seat.
 */

function renderNavigationHall(svgId, hallConfig, targetSeat) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    svg.innerHTML = '';

    const W = 800, H = 620;
    const seatSize = 12, seatGap = 3, rowGap = 4, sectorGap = 40;
    const seatUnit = seatSize + seatGap;
    const screenY = 25, screenH = 30, screenW = 500;
    const entranceY = 595;

    const sectors = {
        left:   { label: 'Левый',       seatsPerRow: 8, rows: 20 },
        center: { label: 'Центральный', seatsPerRow: 9, rows: 20 },
        right:  { label: 'Правый',      seatsPerRow: 8, rows: 20 },
    };

    const leftW = sectors.left.seatsPerRow * seatUnit;
    const centerW = sectors.center.seatsPerRow * seatUnit;
    const rightW = sectors.right.seatsPerRow * seatUnit;
    const totalW = leftW + centerW + rightW + 2 * sectorGap;
    const startX = (W - totalW) / 2;

    const positions = {
        left:   { x: startX, width: leftW },
        center: { x: startX + leftW + sectorGap, width: centerW },
        right:  { x: startX + leftW + centerW + 2 * sectorGap, width: rightW },
    };

    function el(tag, attrs) {
        const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
        return e;
    }

    // Background
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#0f172a', rx: 12 }));

    // Screen
    const sx = (W - screenW) / 2;
    svg.appendChild(el('rect', { x: sx, y: screenY, width: screenW, height: screenH, fill: '#475569', rx: 6 }));
    const sl = el('text', {
        x: W / 2, y: screenY + screenH / 2 + 4,
        'text-anchor': 'middle', fill: '#94a3b8', 'font-size': '12', 'font-weight': '600',
    });
    sl.textContent = 'ЭКРАН';
    svg.appendChild(sl);

    const seatsStartY = screenY + screenH + 35;

    // Draw sectors and find target seat position
    let targetX = 0, targetY = 0;

    for (const sectorKey of ['left', 'center', 'right']) {
        const conf = sectors[sectorKey];
        const pos = positions[sectorKey];

        // Sector label
        const label = el('text', {
            x: pos.x + pos.width / 2, y: seatsStartY - 12,
            'text-anchor': 'middle', fill: '#94a3b8', 'font-size': '14', 'font-weight': '600',
        });
        label.textContent = conf.label;
        svg.appendChild(label);

        // Sector bg
        const totalH = conf.rows * (seatSize + rowGap);
        svg.appendChild(el('rect', {
            x: pos.x - 6, y: seatsStartY - 4,
            width: pos.width + 12, height: totalH + 8,
            fill: sectorKey === targetSeat.sector ? '#1e3a5f' : '#1e293b',
            rx: 8, opacity: 0.5,
        }));

        // Seats
        for (let row = 0; row < conf.rows; row++) {
            const y = seatsStartY + row * (seatSize + rowGap);
            for (let num = 0; num < conf.seatsPerRow; num++) {
                const x = pos.x + num * seatUnit;

                const isTarget = sectorKey === targetSeat.sector &&
                                 row + 1 === targetSeat.row &&
                                 num + 1 === targetSeat.number;

                if (isTarget) {
                    targetX = x + seatSize / 2;
                    targetY = y + seatSize / 2;
                }

                svg.appendChild(el('rect', {
                    x, y, width: seatSize, height: seatSize,
                    fill: isTarget ? '#ef4444' : '#334155',
                    rx: 3,
                    opacity: isTarget ? 1 : 0.4,
                    class: isTarget ? 'seat-highlight' : '',
                }));
            }
        }

        // Aisle
        const aisleY = seatsStartY + 10 * (seatSize + rowGap) - rowGap / 2;
        svg.appendChild(el('line', {
            x1: pos.x - 6, y1: aisleY,
            x2: pos.x + pos.width + 6, y2: aisleY,
            stroke: '#334155', 'stroke-width': 1, 'stroke-dasharray': '4 3',
        }));
    }

    // Entrances
    const entranceMap = {
        left: 'A', center: 'Б', right: 'В',
    };

    const entPositions = {
        A: positions.left.x + positions.left.width / 2,
        'Б': positions.center.x + positions.center.width / 2,
        'В': positions.right.x + positions.right.width / 2,
    };

    const myEntrance = entranceMap[targetSeat.sector];
    let entranceX = entPositions[myEntrance];
    let entranceYPos = entranceY;

    for (const [id, ex] of Object.entries(entPositions)) {
        const isMyEntrance = id === myEntrance;
        svg.appendChild(el('rect', {
            x: ex - 25, y: entranceY - 10,
            width: 50, height: 22,
            fill: isMyEntrance ? '#ef4444' : '#f97316',
            rx: 6,
            opacity: isMyEntrance ? 1 : 0.4,
        }));
        const txt = el('text', {
            x: ex, y: entranceY + 5,
            'text-anchor': 'middle', fill: 'white', 'font-size': '10', 'font-weight': '700',
        });
        txt.textContent = `Вход ${id}`;
        svg.appendChild(txt);
    }

    // Draw navigation path from entrance to seat
    const sectorPos = positions[targetSeat.sector];
    const sectorCenterX = sectorPos.x + sectorPos.width / 2;

    // Path: entrance → sector center bottom → seat row → seat
    const pathPoints = [
        `${entranceX},${entranceYPos - 15}`,
        `${sectorCenterX},${entranceYPos - 30}`,
        `${sectorCenterX},${targetY + seatSize}`,
        `${targetX},${targetY + seatSize}`,
        `${targetX},${targetY}`,
    ];

    const path = el('polyline', {
        points: pathPoints.join(' '),
        class: 'nav-path',
    });
    svg.appendChild(path);

    // Target seat marker (pulsing circle)
    svg.appendChild(el('circle', {
        cx: targetX, cy: targetY,
        r: 10, fill: 'none', stroke: '#ef4444',
        'stroke-width': 2, opacity: 0.6,
        class: 'seat-highlight',
    }));
}
