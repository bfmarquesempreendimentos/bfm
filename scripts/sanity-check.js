#!/usr/bin/env node
/**
 * Verificação rápida: sintaxe JS + conflitos de variáveis globais entre scripts do index.html.
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var childProcess = require('child_process');

var root = path.join(__dirname, '..');
var pages = ['index.html', 'admin.html'];

function collectScripts(htmlPath) {
    var indexHtml = fs.readFileSync(path.join(root, htmlPath), 'utf8');
    var scriptRe = /<script[^>]+src="([^"?]+\.js)(?:\?[^"]*)?"[^>]*><\/script>/g;
    var scripts = [];
    var m;
    while ((m = scriptRe.exec(indexHtml))) {
        if (m[1].indexOf('http') === 0) continue;
        scripts.push(m[1]);
    }
    return scripts;
}

var scripts = [];
pages.forEach(function(page) {
    collectScripts(page).forEach(function(rel) {
        if (scripts.indexOf(rel) === -1) scripts.push(rel);
    });
});

var globals = {};
var errors = [];

function checkSyntax(filePath) {
    try {
        childProcess.execFileSync('node', ['--check', filePath], { stdio: 'pipe' });
        return true;
    } catch (e) {
        errors.push('Sintaxe inválida: ' + path.relative(root, filePath));
        return false;
    }
}

function scanGlobals(filePath) {
    var code = fs.readFileSync(filePath, 'utf8');
    var declRe = /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/gm;
    var match;
    while ((match = declRe.exec(code))) {
        var name = match[1];
        if (globals[name]) {
            errors.push('Conflito global "' + name + '": ' + globals[name] + ' e ' + path.relative(root, filePath));
        } else {
            globals[name] = path.relative(root, filePath);
        }
    }
}

scripts.forEach(function(rel) {
    var abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
        errors.push('Arquivo ausente: ' + rel);
        return;
    }
    checkSyntax(abs);
    scanGlobals(abs);
});

if (errors.length) {
    console.error('Falhas na verificação (' + errors.length + '):');
    errors.forEach(function(msg) { console.error('  - ' + msg); });
    process.exit(1);
}

try {
    childProcess.execFileSync('node', [path.join(__dirname, 'inventory-parity-check.js')], { stdio: 'pipe' });
} catch (e) {
    console.error('Falha na paridade do inventário.');
    process.exit(1);
}

console.log('OK: ' + scripts.length + ' scripts verificados, sem conflitos globais detectados.');
