'use client';

import QRCode from 'react-qr-code';
import { X, Download, Printer } from 'lucide-react';

interface StoreQRModalProps {
  storeName: string;
  companySlug: string;
  brandSlug: string;
  storeSlug: string;
  onClose: () => void;
}

export default function StoreQRModal({
  storeName,
  companySlug,
  brandSlug,
  storeSlug,
  onClose,
}: StoreQRModalProps) {
  const qrValue = JSON.stringify({
    v: 1,
    company: companySlug,
    brand: brandSlug,
    store: storeSlug,
  });

  const downloadPng = () => {
    const svg = document.getElementById('store-qr-svg') as SVGSVGElement | null;
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 300, 300);
      ctx.drawImage(img, 0, 0, 300, 300);
      const link = document.createElement('a');
      link.download = `${storeSlug}-qr.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const printQR = () => {
    const svg = document.getElementById('store-qr-svg') as SVGSVGElement | null;
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>${storeName} QR Code</title>
          <style>
            body { display: flex; flex-direction: column; align-items: center;
                   justify-content: center; min-height: 100vh; font-family: sans-serif; gap: 12px; }
            svg { width: 256px; height: 256px; }
            .name { font-size: 16px; font-weight: 600; }
            .slug { font-size: 12px; color: #666; font-family: monospace; }
          </style>
        </head>
        <body>
          ${serialized}
          <p class="name">${storeName}</p>
          <p class="slug">${storeSlug}</p>
          <script>window.onload = () => { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-semibold text-gray-900">Store QR Code</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="p-4 bg-white border border-gray-200 rounded-xl">
            <QRCode
              value={qrValue}
              size={220}
              id="store-qr-svg"
            />
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900">{storeName}</p>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{storeSlug}</p>
          </div>
          <div className="flex gap-3 w-full">
            <button
              onClick={downloadPng}
              className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PNG
            </button>
            <button
              onClick={printQR}
              className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
