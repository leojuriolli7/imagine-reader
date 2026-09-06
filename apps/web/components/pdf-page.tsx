"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export default function PdfPage({
  id,
  page,
  onLoaded,
}: {
  id: string;
  page: number;
  onLoaded: (pages: number) => void;
}) {
  const element = useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState(600);

  useEffect(() => {
    const node = element.current;

    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry) setWidth(Math.min(760, entry.contentRect.width));
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={element} className="w-full">
      <Document
        file={`/api/books/${id}/file`}
        onLoadSuccess={(pdf) => onLoaded(pdf.numPages)}
        loading={<p className="p-12 text-center text-muted-foreground">Opening your book…</p>}
        error={
          <p role="alert" className="p-12">
            This PDF could not be opened. It may be encrypted or damaged.
          </p>
        }
      >
        <Page
          pageNumber={page}
          width={width}
          renderAnnotationLayer={false}
          loading={<p className="p-12">Loading page…</p>}
        />
      </Document>
    </div>
  );
}
