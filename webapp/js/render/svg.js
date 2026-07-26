/**
 * Display list -> SVG.
 *
 * The output is fully self contained (no external font or image references) so
 * it can be inlined in the page, saved as `.svg`, or rasterised to PNG through
 * a canvas without tainting it.
 */

const ANCHORS = { left: 'start', center: 'middle', right: 'end' };

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function num(value) {
  return Math.round(value * 100) / 100;
}

export function renderSvg(drawing, options = {}) {
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(drawing.width)}" height="${num(drawing.height)}" `
    + `viewBox="0 0 ${num(drawing.width)} ${num(drawing.height)}" font-family="Helvetica, Arial, sans-serif">`,
  );
  parts.push(`<rect x="0" y="0" width="${num(drawing.width)}" height="${num(drawing.height)}" fill="${options.background ?? '#ffffff'}"/>`);

  for (const op of drawing.ops) {
    if (op.type === 'rect') {
      const fill = op.fill ?? 'none';
      const stroke = op.stroke ?? 'none';
      parts.push(
        `<rect x="${num(op.x)}" y="${num(op.y)}" width="${num(op.w)}" height="${num(op.h)}" `
        + `fill="${fill}" stroke="${stroke}" stroke-width="${num(op.lineWidth)}"/>`,
      );
    } else if (op.type === 'line') {
      parts.push(
        `<line x1="${num(op.x1)}" y1="${num(op.y1)}" x2="${num(op.x2)}" y2="${num(op.y2)}" `
        + `stroke="${op.stroke}" stroke-width="${num(op.lineWidth)}"/>`,
      );
    } else if (op.type === 'text') {
      const spacing = op.letterSpacing ? ` letter-spacing="${num(op.letterSpacing)}"` : '';
      parts.push(
        `<text x="${num(op.x)}" y="${num(op.y)}" font-size="${num(op.size)}" `
        + `font-weight="${op.bold ? 'bold' : 'normal'}" fill="${op.color}" `
        + `text-anchor="${ANCHORS[op.align] ?? 'start'}"${spacing}>${escapeXml(op.value)}</text>`,
      );
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}

/** Rasterises an SVG string to a PNG blob at `scale` times its natural size. */
export function svgToPngBlob(svg, scale = 3) {
  return new Promise((resolve, reject) => {
    const match = /width="([\d.]+)" height="([\d.]+)"/.exec(svg);
    if (!match) {
      reject(new Error('Could not determine the size of the rendered form.'));
      return;
    }
    const width = Number(match[1]);
    const height = Number(match[2]);
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.setTransform(scale, 0, 0, scale, 0, 0);
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('The browser could not produce a PNG image.'));
          }
        }, 'image/png');
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The browser could not render the form image.'));
    };
    image.src = url;
  });
}
