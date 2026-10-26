import test from 'node:test';
import assert from 'node:assert/strict';
import { historyTooltipPlacement } from '../public/history-tooltip.js';

const dot = (x, y) => ({ left: x - 7, right: x + 7, top: y - 7, bottom: y + 7 });

function assertUnobstructed(options) {
  const placement = historyTooltipPlacement(options);
  assert.ok(placement, 'there is space to show the details');
  assert.ok(placement.height > 0 && placement.height <= options.height);
  assert.ok(placement.left >= 12 && placement.top >= 12);
  assert.ok(placement.left + options.width <= options.viewportWidth - 12);
  assert.ok(placement.top + placement.height <= options.viewportHeight - 12);
  for (const point of [...options.points, options.anchor]) {
    const overlaps = placement.left < point.right && placement.left + options.width > point.left
      && placement.top < point.bottom && placement.top + placement.height > point.top;
    assert.equal(overlaps, false, 'the card leaves every chart dot visible');
  }
  return placement;
}

test('long details shrink to the space beside the chart instead of covering the selected dot', () => {
  const placement = assertUnobstructed({
    anchor: dot(220, 400), points: [dot(80, 330), dot(220, 400), dot(340, 290)],
    width: 366, height: 360, viewportWidth: 390, viewportHeight: 620
  });
  assert.ok(placement.height < 360);
});

test('nearby dots stay visible even when they are above or below the selected dot', () => {
  assertUnobstructed({
    anchor: dot(700, 460), points: [dot(560, 320), dot(700, 460), dot(820, 570)],
    width: 440, height: 360, viewportWidth: 1280, viewportHeight: 800
  });
});

test('short landscape viewports can place details to the side of the dot', () => {
  const anchor = dot(90, 80);
  const placement = assertUnobstructed({
    anchor, points: [anchor], width: 440, height: 136, viewportWidth: 844, viewportHeight: 160
  });
  assert.ok(placement.left > anchor.right);
  assert.equal(placement.height, 136);
});

test('placements stay on screen and avoid dots at chart and viewport edges', () => {
  for (const [viewportWidth, viewportHeight] of [[390, 844], [844, 390], [1280, 800]]) {
    const width = Math.min(440, viewportWidth - 24);
    const points = Array.from({ length: 8 }, (_, index) => dot(
      24 + index * (viewportWidth - 48) / 7,
      viewportHeight * (0.35 + Math.sin(index) * 0.15)
    ));
    for (const anchor of [...points, dot(24, 16), dot(viewportWidth - 24, viewportHeight - 16)]) {
      assertUnobstructed({ anchor, points, width, height: 360, viewportWidth, viewportHeight });
    }
  }
});
