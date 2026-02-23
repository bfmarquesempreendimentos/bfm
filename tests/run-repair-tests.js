#!/usr/bin/env node
/**
 * Testes automatizados - Solicitação de Reparo
 * Execute: node tests/run-repair-tests.js
 */

const REPAIR_MIN_PHOTOS = 3;
const REPAIR_MAX_FILES = 5;
const REPAIR_MAX_TOTAL_SIZE = 50 * 1024 * 1024;
const REPAIR_MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const REPAIR_MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function isImageFile(file) {
    return file.type && file.type.startsWith('image/');
}
function isVideoFile(file) {
    return file.type && file.type.startsWith('video/');
}
function validateRepairFiles(files) {
    const arr = Array.isArray(files) ? files : Array.from(files || []);
    const photoCount = arr.filter(isImageFile).length;
    const total = arr.length;
    if (total > REPAIR_MAX_FILES) return { valid: false, error: `Máximo de ${REPAIR_MAX_FILES} arquivos.` };
    if (photoCount < REPAIR_MIN_PHOTOS) return { valid: false, error: `Mínimo ${REPAIR_MIN_PHOTOS} fotos.` };
    const totalSize = arr.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalSize > REPAIR_MAX_TOTAL_SIZE) return { valid: false, error: 'Total ultrapassa 50MB.' };
    const oversizedImg = arr.find(f => isImageFile(f) && (f.size || 0) > REPAIR_MAX_IMAGE_SIZE);
    if (oversizedImg) return { valid: false, error: 'Imagem ultrapassa 10MB.' };
    const oversizedVid = arr.find(f => isVideoFile(f) && (f.size || 0) > REPAIR_MAX_VIDEO_SIZE);
    if (oversizedVid) return { valid: false, error: 'Vídeo ultrapassa 50MB.' };
    const invalid = arr.find(f => !isImageFile(f) && !isVideoFile(f));
    if (invalid) return { valid: false, error: 'Apenas fotos e vídeos.' };
    return { valid: true };
}

function mockFile(name, type, size = 100) {
    return { name, type, size };
}

let passed = 0, failed = 0;
function test(name, condition) {
    if (condition) { console.log('  ✓', name); passed++; }
    else { console.log('  ✗', name); failed++; }
}

console.log('\n=== Testes - Solicitação de Reparo ===\n');

test('2 fotos deve falhar', !validateRepairFiles([
    mockFile('a.jpg', 'image/jpeg'), mockFile('b.png', 'image/png')
]).valid);

test('3 fotos deve passar', validateRepairFiles([
    mockFile('a.jpg', 'image/jpeg'), mockFile('b.png', 'image/png'), mockFile('c.gif', 'image/gif')
]).valid);

test('3 fotos + 1 vídeo deve passar', validateRepairFiles([
    mockFile('a.jpg', 'image/jpeg'), mockFile('b.png', 'image/png'), mockFile('c.gif', 'image/gif'),
    mockFile('v.mp4', 'video/mp4')
]).valid);

test('6 arquivos deve falhar', !validateRepairFiles(
    Array(6).fill(0).map((_, i) => mockFile('f' + i + '.jpg', 'image/jpeg'))
).valid);

test('2 fotos + 1 vídeo deve falhar', !validateRepairFiles([
    mockFile('v.mp4', 'video/mp4'), mockFile('a.jpg', 'image/jpeg'), mockFile('b.jpg', 'image/jpeg')
]).valid);

test('5 fotos deve passar', validateRepairFiles(
    Array(5).fill(0).map((_, i) => mockFile('f' + i + '.jpg', 'image/jpeg'))
).valid);

test('Imagem > 10MB deve falhar', !validateRepairFiles([
    mockFile('a.jpg', 'image/jpeg', 11 * 1024 * 1024),
    mockFile('b.jpg', 'image/jpeg'), mockFile('c.jpg', 'image/jpeg')
]).valid);

test('Vídeo > 50MB deve falhar', !validateRepairFiles([
    mockFile('a.jpg', 'image/jpeg'), mockFile('b.jpg', 'image/jpeg'), mockFile('c.jpg', 'image/jpeg'),
    mockFile('v.mp4', 'video/mp4', 51 * 1024 * 1024)
]).valid);

test('PDF deve falhar', !validateRepairFiles([
    mockFile('a.jpg', 'image/jpeg'), mockFile('b.jpg', 'image/jpeg'), mockFile('c.pdf', 'application/pdf')
]).valid);

test('4 fotos + 1 webm deve passar', validateRepairFiles([
    mockFile('a.jpg', 'image/jpeg'), mockFile('b.jpg', 'image/jpeg'),
    mockFile('c.jpg', 'image/jpeg'), mockFile('d.jpg', 'image/jpeg'),
    mockFile('v.webm', 'video/webm')
]).valid);

console.log('\n--- Resultado ---');
console.log(`  ${passed} passaram, ${failed} falharam\n`);
process.exit(failed > 0 ? 1 : 0);
