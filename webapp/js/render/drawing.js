/**
 * A page-independent display list.
 *
 * The worksheet is described once as a list of primitives and then handed to
 * either the SVG renderer (screen preview and PNG export) or the PDF renderer
 * (vector export). Coordinates are in points with the origin at the top-left of
 * the page and y increasing downwards; the PDF renderer flips them.
 */

import { measureText, truncateText, wrapText } from './fonts.js';

export class Drawing {
  /**
   * @param {number} width page width in points
   * @param {number} height page height in points
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.ops = [];
  }

  rect(x, y, w, h, options = {}) {
    this.ops.push({
      type: 'rect',
      x,
      y,
      w,
      h,
      fill: options.fill ?? null,
      stroke: options.stroke ?? null,
      lineWidth: options.lineWidth ?? 0.6,
    });
    return this;
  }

  line(x1, y1, x2, y2, options = {}) {
    this.ops.push({
      type: 'line',
      x1,
      y1,
      x2,
      y2,
      stroke: options.stroke ?? '#000000',
      lineWidth: options.lineWidth ?? 0.6,
    });
    return this;
  }

  /**
   * `y` is the text baseline. Use `textInBox` when you want vertical centring.
   * @param {'left'|'center'|'right'} [options.align]
   */
  text(value, x, y, options = {}) {
    const string = String(value ?? '');
    if (string === '') {
      return this;
    }
    this.ops.push({
      type: 'text',
      value: string,
      x,
      y,
      size: options.size ?? 8,
      bold: options.bold ?? false,
      color: options.color ?? '#000000',
      align: options.align ?? 'left',
      letterSpacing: options.letterSpacing ?? 0,
    });
    return this;
  }

  /** Draws `value` centred (or aligned) inside the given box, clipped to width. */
  textInBox(value, box, options = {}) {
    const size = options.size ?? 8;
    const bold = options.bold ?? false;
    const padding = options.padding ?? 2;
    const align = options.align ?? 'center';
    const available = Math.max(0, box.w - padding * 2);
    const string = options.clip === false
      ? String(value ?? '')
      : truncateText(value, available, size, bold);
    const y = box.y + box.h / 2 + size * 0.35;
    let x;
    if (align === 'left') {
      x = box.x + padding;
    } else if (align === 'right') {
      x = box.x + box.w - padding;
    } else {
      x = box.x + box.w / 2;
    }
    return this.text(string, x, y, { ...options, size, bold, align });
  }

  /** Word-wrapped paragraph. Returns the y coordinate after the last line. */
  paragraph(value, x, y, width, options = {}) {
    const size = options.size ?? 7;
    const bold = options.bold ?? false;
    const lineHeight = options.lineHeight ?? size * 1.25;
    const maxLines = options.maxLines ?? Infinity;
    const lines = wrapText(value, width, size, bold);
    let cursor = y + size;
    let drawn = 0;
    for (const line of lines) {
      if (drawn >= maxLines) {
        break;
      }
      const isLast = drawn === maxLines - 1 && lines.length > maxLines;
      this.text(isLast ? truncateText(line, width, size, bold) : line, x, cursor, {
        size,
        bold,
        color: options.color,
        align: 'left',
      });
      cursor += lineHeight;
      drawn += 1;
    }
    return cursor - lineHeight + (size * 0.3);
  }

  measure(value, size, bold) {
    return measureText(value, size, bold);
  }
}

/** Convenience box helper used throughout the worksheet layout. */
export function box(x, y, w, h) {
  return { x, y, w, h };
}
