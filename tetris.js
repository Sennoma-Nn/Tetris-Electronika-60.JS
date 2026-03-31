#!/usr/bin/env node

const fs = require('fs');

let debugFile = '/dev/null';
let enableBeep = true;
let isDecCompatible = false
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if (args[i] === '-d' && args[i + 1]) {
        debugFile = args[i + 1];
        i++;
    } else if (args[i] === '-n') {
        enableBeep = false;
    } else if (args[i] === '-v') {
        isDecCompatible = true;
    }
}

let gameLevel = 0;
let fallInterval;

const log = (text) => {
    if (debugFile !== '/dev/null') fs.appendFileSync(debugFile, text);
}

const Print = (text) => fs.writeSync(1, text);
const blockStr = '[]';

function beep() {
    if (enableBeep) {
        Print("\x07");
    }
}

function resetColorBg() {
    if (!isDecCompatible) {
        Print('\x1b[0;40;32m');
        Print('\x1b[H\x1b[2J');
    } else {
        Print('\x1b[0m');
        Print('\x1b[H\x1b[2J');
        Print("\x1b[2*x\x1b[1;1;24;80;40$r\x1b[*x");
        Print('\x1b[40;32m');
    }
}

function showTitle() {
    beep();
    resetColorBg();

    Print('\x1b[4 q');
    Print('\x1b]0;ИГРАТЬ В ТЕТРИС\x07');

    const titleHeight = 7;
    Print(`\x1b[${titleHeight};36H${blockStr}`);
    Print(`\x1b[${titleHeight + 1};36HТЕТРИС`);
    Print(`\x1b[${titleHeight + 2};40H${blockStr}`);

    Print('\x1b[12B');

    const prompt = `\x1b[21GВАШ УРОВЕНЬ? (0-9) - \x1b[s`;
    Print(prompt);

    let inputChar = '';
    let inputPosition = prompt.length;

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const handleInput = (key) => {
        beep();
        if (key.charCodeAt(0) === 3) process.exit(0);
        if (key === "\v" || key === "\f" || key === "\t") return;
        else if (key === '\x7f' || key === '\b') {
            inputChar = '';
            Print(`\x1b[u \x1b[u`);
        } else if (key === '\r' || key === '\n') {
            process.stdin.removeAllListeners('data');

            const level = parseInt(inputChar);
            const canUse = Number.isInteger(level) && level >= 0 && level <= 9;
            gameLevel = canUse ? level : 0;

            initGame();
            return;
        } else if (key.length <= 1) {
            if (inputChar) Print(`\x1b[u`);

            inputChar = key;
            Print(inputChar);
        }
    };

    process.stdin.on('data', handleInput);
}

function resetPlayfield() {
    resetColorBg();

    for (let y = 0; y < 22; y++) {
        let line = `\x1b[${y + 2};26H<!`;
        line += ' .'.repeat(10);
        line += '!>';

        if (y === 20) line = `\x1b[${y + 2};26H<!${'='.repeat(20)}!>`;
        if (y === 21) line = `\x1b[${y + 2};28H${'\\/'.repeat(10)}`;

        Print(`${line}`);
    }

    const status_panel = [
        { l: 'ПОЛНЫХ СТРОК:  0' },
        { l: `УРОВЕНЬ:       ${gameLevel}`, r: `7: НАЛЕВО   9: НАПРАВО` },
        { l: '  СЧЕТ:    0', r: '     8:ПОВОРОТ' },
        { r: '4:УСКОРИТЬ  5:СБРОСИТЬ' },
        { r: '1: ПОКАЗАТЬ  СЛЕДУЮЩУЮ' },
        { r: '0:  СТЕРЕТЬ ЭТОТ ТЕКСТ' },
        { r: '  ПРОБЕЛ - СБРОСИТЬ' }
    ];

    for (const [index, { r }] of status_panel.entries()) {
        const row = index + 2;
        Print(`\x1b[${row};53H${r ?? ''}`);
    }

    for (const [index, { l }] of status_panel.entries()) {
        const row = index + 2;
        Print(`\x1b[${row};1H${l ?? ''}`);
    }
}

const blockShapes = [
    [ // I
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    [ // O
        [0, 0, 0, 0],
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0]
    ],
    [ // T
        [0, 0, 0],
        [1, 1, 1],
        [0, 1, 0]
    ],
    [ // J
        [0, 0, 0],
        [1, 1, 1],
        [0, 0, 1]
    ],
    [ // L
        [0, 0, 0],
        [1, 1, 1],
        [1, 0, 0]
    ],
    [ // Z
        [0, 0, 0],
        [1, 1, 0],
        [0, 1, 1]
    ],
    [ // S
        [0, 0, 0],
        [0, 1, 1],
        [1, 1, 0]
    ]
]

const getSpeed = (level) => Number((1 - (level - 1) * (1 - 0.3) / (9 - 1)).toFixed(4)) * 1000;

const rotate = (block, direction) => {
    const N = block.length;
    if (direction === 'r') {
        return block.map((row, i) =>
            row.map((val, j) => block[N - 1 - j][i])
        );
    } else if (direction === 'l') {
        return block.map((row, i) =>
            row.map((val, j) => block[j][N - 1 - i])
        );
    }
}

let currentX = 5;
let currentY = 0;
let currentShape = blockShapes[0];
let nextShape = blockShapes[Math.floor(Math.random() * blockShapes.length)];
let playfield = Array(20).fill().map(() => Array(10).fill(0));
let showNextBlock = false;
let lockInterrupted = false;
let totalLinesCleared = 0
let score = 0;
let blockStartY = 0;
let lastSymbolCount = 0

let leaderboard = [];

function clearBlock() {
    for (let y = 0; y < currentShape.length; y++) {
        for (let x = 0; x < currentShape[y].length; x++) {
            if (currentShape[y][x]) {
                const screenY = currentY + y;
                if (screenY >= 1) Print(`\x1b[${screenY + 1};${(currentX + x) * 2 + 26}H .`);
            }
        }
    }
}

function drawBlock() {
    for (let y = 0; y < currentShape.length; y++) {
        for (let x = 0; x < currentShape[y].length; x++) {
            if (currentShape[y][x]) {
                const screenY = currentY + y;
                if (screenY >= 1) Print(`\x1b[${screenY + 1};${(currentX + x) * 2 + 26}H${blockStr}`);
            }
        }
    }
}

function checkCollision() {
    for (let y = 0; y < currentShape.length; y++) {
        for (let x = 0; x < currentShape[y].length; x++) {
            if (currentShape[y][x]) {
                const fieldY = currentY + y - 1;
                const fieldX = currentX + x - 1;
                if (fieldY >= 0 && fieldY < 20 && fieldX >= 0 && fieldX < 10) {
                    if (playfield[fieldY][fieldX]) return true;
                }
            }
        }
    }
    return false;
}

function gameOver() {
    clearInterval(fallInterval);
    log('游戏结束\n');

    process.stdin.removeAllListeners('data');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    Print('\x1b[16;1HВАШЕ ИМЯ? ');
    let inputName = '';

    const onData = (key) => {
        beep();

        if (/^\x1b\[\d*[ABCD]$/.test(key)) return;
        if (key === "\v" || key === "\f" || key === "\t") return;
        if (key.charCodeAt(0) === 3) process.exit(0);

        if (key === '\n' || key === '\r') {
            process.stdin.setRawMode(false);

            const trimmedName = inputName.trim().slice(0, 16);
            log(`名称:\t${trimmedName}\n`);
            process.stdin.removeListener('data', onData);

            if (trimmedName !== "") {
                leaderboard.push({
                    name: trimmedName,
                    score: score,
                    level: gameLevel,
                    isLatest: true
                });

                leaderboard.forEach(entry => {
                    if (entry !== leaderboard[leaderboard.length - 1]) {
                        entry.isLatest = false;
                    }
                });

                leaderboard.sort((a, b) => b.score - a.score);

                log(`排行榜加入: ${trimmedName} - ${score}\n`);
            } else {
                leaderboard.forEach(entry => {
                    entry.isLatest = false;
                });
            }

            showLeaderboard();
            return;
        }

        if (key === '\x7f' || key === '\b') {
            if (inputName.length > 0) {
                inputName = inputName.slice(0, -1);
                Print('\b \b');
            }
            return;
        }

        inputName += key;
        Print(key);
    };

    process.stdin.on('data', onData);
}

function spawnBlock() {
    const isIO = nextShape === blockShapes[0] || nextShape === blockShapes[1];
    currentX = isIO ? 4 : 5;
    currentY = 0;
    currentShape = nextShape;
    nextShape = blockShapes[Math.floor(Math.random() * blockShapes.length)];
    blockStartY = 0;
    lockInterrupted = false;

    if (checkCollision()) {
        gameOver();
        return;
    }

    if (fallInterval) clearInterval(fallInterval);
    fallInterval = setInterval(() => moveBlock(0, 1, true), getSpeed(gameLevel));

    if (showNextBlock) drawNextBlock();
    drawBlock();
}

function drawNextBlock() {
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            Print(`\x1b[${y + 11};${x * 2 + 17}H  `);
        }
    }

    const isIO = nextShape === blockShapes[0] || nextShape === blockShapes[1];
    const xOffset = isIO ? 17 : 19;

    for (let y = 0; y < nextShape.length; y++) {
        for (let x = 0; x < nextShape[y].length; x++) {
            if (nextShape[y][x]) {
                Print(`\x1b[${y + 11};${x * 2 + xOffset}H${blockStr}`);
            }
        }
    }
}

function canMove(dx, dy) {
    for (let y = 0; y < currentShape.length; y++) {
        for (let x = 0; x < currentShape[y].length; x++) {
            if (currentShape[y][x]) {
                const nx = currentX + x + dx;
                const ny = currentY + y + dy;
                if (nx <= 0 || nx > 10 || ny > 20) return false;
                if (ny >= 1 && ny <= 20 && playfield[ny - 1][nx - 1]) return false;
            }
        }
    }
    return true;
}

function canRotate(direction) {
    const rotated = rotate(currentShape, direction);
    for (let y = 0; y < rotated.length; y++) {
        for (let x = 0; x < rotated[y].length; x++) {
            if (rotated[y][x]) {
                const nx = currentX + x;
                const ny = currentY + y;
                if (nx <= 0 || nx > 10 || ny > 20) return false;
                if (ny >= 1 && ny <= 20 && playfield[ny - 1][nx - 1]) return false;
            }
        }
    }
    return true;
}

function moveBlock(dx, dy) {
    if (dy > 0) {
        const isLanded = !canMove(0, 1);
        if (isLanded) {
            if (lockInterrupted) {
                lockInterrupted = false;
                return;
            }

            if (!canMove(0, 1)) {
                log('方块锁定\n');
                lockBlock();
            }
        }
    }

    if (canMove(dx, dy)) {
        clearBlock();
        currentX += dx;
        currentY += dy;

        drawBlock();

        if (!canMove(0, 1) && currentY > 0) lockInterrupted = true;
    }
}

function lockBlock() {
    let hasBlockAboveTop = false;

    for (let y = 0; y < currentShape.length; y++) {
        for (let x = 0; x < currentShape[y].length; x++) {
            if (currentShape[y][x]) {
                const fieldY = currentY + y - 1;
                const fieldX = currentX + x - 1;

                if (fieldY < 0) {
                    hasBlockAboveTop = true;
                }

                if (fieldY >= 0 && fieldY < 20 && fieldX >= 0 && fieldX < 10) {
                    playfield[fieldY][fieldX] = 1;
                }
            }
        }
    }

    if (hasBlockAboveTop) {
        gameOver();
        return;
    }

    calculateDropScore();
    checkAndClearLines();
    spawnBlock();
}

function calculateDropScore() {
    const rowsDescended = currentY - blockStartY;
    let dropScore = Math.max(0, 19 - rowsDescended);
    dropScore += 3 * (gameLevel + 1);
    if (!showNextBlock) dropScore += 5;

    score += dropScore;
    log(`┌ 下落得分:\t${dropScore}\n├ 下落行数:\t${rowsDescended}\n├ 预览奖励:\t${showNextBlock ? 0 : 5}\n│\n└ 当前分数:\t${score}\n`)

    updateScoreDisplay();
}

function updateScoreDisplay() {
    displayScore = String(score % 1000).padStart(3, ' ');
    const scoreText = `  СЧЕТ:  ${displayScore}`;
    Print(`\x1b[4;1H${scoreText}`);

    const currentSymbolCount = Math.floor(score / 1000);
    if (currentSymbolCount > lastSymbolCount) {
        updateScoreSymbols();
        lastSymbolCount = currentSymbolCount;
    }
}

function updateScoreSymbols() {
    const symbolCount = Math.floor(score / 1000);
    if (symbolCount <= 0) return;
    const lastSymbolIndex = symbolCount - 1;
    const row = 5 + Math.floor(lastSymbolIndex / 5);
    const col = 2 + (lastSymbolIndex % 5) * 2;
    Print(`\x1b[${row};${col}H¤`);
}

function checkAndClearLines() {
    let linesCleared = 0;
    let affectedRows = new Set();

    for (let y = 19; y >= 0; y--) {
        let isLineFull = true;

        for (let x = 0; x < 10; x++) {
            if (playfield[y][x] === 0) {
                isLineFull = false;
                break;
            }
        }

        if (isLineFull) {
            linesCleared++;

            let topRowWithBlocks = y;
            for (let checkY = y - 1; checkY >= 0; checkY--) {
                let hasBlocks = false;
                for (let x = 0; x < 10; x++) {
                    if (playfield[checkY][x] !== 0) {
                        hasBlocks = true;
                        break;
                    }
                }

                if (hasBlocks) {
                    topRowWithBlocks = checkY;
                } else {
                    break;
                }
            }

            for (let moveY = y; moveY >= topRowWithBlocks; moveY--) {
                affectedRows.add(moveY);
            }

            for (let moveY = y; moveY > 0; moveY--) {
                for (let x = 0; x < 10; x++) {
                    playfield[moveY][x] = playfield[moveY - 1][x];
                }
            }

            for (let x = 0; x < 10; x++) {
                playfield[0][x] = 0;
            }

            y++

            log(`┌ 消除行:\t${y}\n`);
        }
    }

    if (linesCleared > 0) {
        totalLinesCleared += linesCleared;
        log(`├ 本次消除:\t${linesCleared}\n│\n└ 总计 ${totalLinesCleared} 行\n`);

        updateLinesClearedDisplay();
        updatePlayfieldDisplay(Array.from(affectedRows), linesCleared);
    }
}

function updateLinesClearedDisplay() {
    const linesText = `ПОЛНЫХ СТРОК:  ${totalLinesCleared}`;
    Print(`\x1b[2;1H${linesText}`);
}

function updatePlayfieldDisplay(affectedRows, linesCleared) {
    const firstLine = affectedRows[0];
    for (let y = firstLine; y > firstLine - linesCleared; y--) {
        for (let x = 0; x < 10; x++) {
            const screenY = y + 1;
            const screenX = (x + 1) * 2 + 26;
            Print(`\x1b[${screenY + 1};${screenX}H .`);
        }
    }

    const reverseAffectedRows = affectedRows.reverse();
    for (let y of reverseAffectedRows) {
        for (let x = 0; x < 10; x++) {
            const screenY = y + 1;
            const screenX = (x + 1) * 2 + 26;

            if (playfield[y][x]) Print(`\x1b[${screenY + 1};${screenX}H${blockStr}`);
            else Print(`\x1b[${screenY + 1};${screenX}H .`);
        }
    }
}

function hardDrop() {
    log('硬降\n');

    clearBlock();
    let dropDistance = 0;
    while (canMove(0, dropDistance + 1)) {
        dropDistance++;
    }

    currentY += dropDistance;
    drawBlock();

    lockBlock();
    lastOperationTime = Date.now();
}

function toggleNextBlockPreview() {
    showNextBlock = !showNextBlock;

    if (showNextBlock) {
        drawNextBlock();
    } else {
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                Print(`\x1b[${y + 11};${x * 2 + 17}H  `);
            }
        }
    }
}

function clearRightPanelText() {
    log('清除帮助文本\n');
    for (let row = 3; row <= 8; row++) {
        Print(`\x1b[${row};53H${' '.repeat(22)}`);
    }
}

function rotateBlock(direction) {
    if (currentShape === blockShapes[1]) return;

    if (canRotate(direction)) {
        clearBlock();
        currentShape = rotate(currentShape, direction);
        drawBlock();
        lastOperationTime = Date.now();

        if (!canMove(0, 1) && currentY > 0) {
            lockInterrupted = true;
            log('旋转打断锁定\n');
        }
    }
}

function initGame() {
    resetPlayfield();
    spawnBlock();

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (key) => {
        beep();
        if (key === '7') moveBlock(-1, 0);
        else if (key === '9') moveBlock(1, 0);
        else if (key === '4') moveBlock(0, 1);
        else if (key === '8') rotateBlock('l');
        else if (key === ' ' || key === '5') hardDrop();
        else if (key === '1') toggleNextBlockPreview();
        else if (key === '0') clearRightPanelText();
        else if (key.charCodeAt(0) === 3) {
            clearInterval(fallInterval);
            process.exit(0);
        }
    });
}

function showLeaderboard() {
    resetColorBg();
    Print('\x1b[2;17HИМЯ        УРОВЕНЬ  СЧЕТ');

    for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        const displayScore = String(entry.score).padStart(6, ' ');
        const row = 3 + i;
        let displayText = `\x1b[${row};17H${entry.name}\x1b[${row};34H${entry.level}${displayScore}`;

        if (entry.isLatest) {
            displayText += ' **';
        }

        Print(displayText);
    }

    Print('\x1b[24;13HЕЩЕ ПАРТИЮ? (ДА/НЕТ) - ');

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    let inputText = '';

    const handleKey = (key) => {
        beep();
        if (/^\x1b\[\d*[ABCD]$/.test(key)) return;
        if (key === "\v" || key === "\f" || key === "\t") return;
        if (key.charCodeAt(0) === 3) process.exit(0);

        if (key === '\n' || key === '\r') {
            if (inputText.toUpperCase() === 'ДА') {
                process.stdin.removeAllListeners('data');
                score = 0;
                totalLinesCleared = 0;
                playfield = Array(20).fill().map(() => Array(10).fill(0));

                showTitle();
            } else {
                process.exit(0);
            }
            return;
        }

        if (key === '\x7f' || key === '\b') {
            if (inputText.length > 0) {
                inputText = inputText.slice(0, -1);
                Print('\b \b');
            }
            return;
        }

        inputText += key;
        Print(key);
    };

    process.stdin.on('data', handleKey);
}

showTitle();
