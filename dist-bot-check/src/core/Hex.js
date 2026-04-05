"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.axialDirections = void 0;
exports.neighbors = neighbors;
exports.hexDistance = hexDistance;
exports.add = add;
exports.subtract = subtract;
exports.equals = equals;
exports.axialKey = axialKey;
exports.lerp = lerp;
exports.hexLerp = hexLerp;
exports.roundCube = roundCube;
exports.hexLine = hexLine;
exports.axialDirections = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 }
];
function neighbors(hex) {
    return exports.axialDirections.map(function (dir) { return ({ q: hex.q + dir.q, r: hex.r + dir.r }); });
}
function hexDistance(a, b) {
    var dq = a.q - b.q;
    var dr = a.r - b.r;
    var ds = (a.q + a.r) - (b.q + b.r);
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}
function add(a, b) {
    return { q: a.q + b.q, r: a.r + b.r };
}
function subtract(a, b) {
    return { q: a.q - b.q, r: a.r - b.r };
}
function equals(a, b) {
    return a.q === b.q && a.r === b.r;
}
function axialKey(h) {
    return "".concat(h.q, ",").concat(h.r);
}
function lerp(a, b, t) {
    return a + (b - a) * t;
}
function hexLerp(a, b, t) {
    var ax = a.q;
    var ay = -a.q - a.r;
    var az = a.r;
    var bx = b.q;
    var by = -b.q - b.r;
    var bz = b.r;
    return {
        x: lerp(ax, bx, t),
        y: lerp(ay, by, t),
        z: lerp(az, bz, t)
    };
}
function roundCube(x, y, z) {
    var rx = Math.round(x);
    var ry = Math.round(y);
    var rz = Math.round(z);
    var xDiff = Math.abs(rx - x);
    var yDiff = Math.abs(ry - y);
    var zDiff = Math.abs(rz - z);
    if (xDiff > yDiff && xDiff > zDiff) {
        rx = -ry - rz;
    }
    else if (yDiff > zDiff) {
        ry = -rx - rz;
    }
    else {
        rz = -rx - ry;
    }
    return { q: rx, r: rz };
}
function hexLine(a, b) {
    var distance = hexDistance(a, b);
    var results = [];
    for (var i = 0; i <= distance; i += 1) {
        var t = distance === 0 ? 0 : i / distance;
        var cube = hexLerp(a, b, t);
        results.push(roundCube(cube.x, cube.y, cube.z));
    }
    return results;
}
