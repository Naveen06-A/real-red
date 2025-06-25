// utils/pdfUtils.ts
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import moment from 'moment';
import logo from '../assets/logo.png';

export const generatePdf = async (
  title: string,
  head: string[][],
  body: (string | number)[][],
  fileName: string,
  outputType: 'save' | 'blob' = 'save'
): Promise<Blob | null> => {
  try {
    const doc = new jsPDF();

    // Load logo with error handling
    let logoLoaded = false;
    try {
      const img = new Image();
      img.src = logo;
      await new Promise((resolve, reject) => {
        img.onload = () => resolve(true);
        img.onerror = () => reject(new Error('Failed to load logo image'));
        // Timeout to prevent hanging if image fails to load
        setTimeout(() => reject(new Error('Logo image loading timed out')), 5000);
      });
      doc.addImage(img, 'PNG', 10, 10, 40, 20);
      logoLoaded = true;
    } catch (error) {
      console.warn('Logo loading failed:', error);
      // Continue without logo
      doc.setFontSize(12);
      doc.text('Logo not available', 10, 15);
    }

    // Add title
    doc.setFontSize(20);
    doc.text(title, logoLoaded ? 60 : 10, logoLoaded ? 20 : 25);

    // Add generation date
    doc.setFontSize(10);
    doc.text(`Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`, logoLoaded ? 60 : 10, logoLoaded ? 30 : 35);

    // Validate head and body
    if (!head || !Array.isArray(head) || head.length === 0 || !head[0]) {
      throw new Error('Invalid table header data');
    }
    if (!body || !Array.isArray(body)) {
      throw new Error('Invalid table body data');
    }

    // Sanitize body data to ensure all values are strings
    const sanitizedBody = body.map((row) =>
      row.map((cell) => (cell == null ? '' : String(cell)))
    );

    // Add table
    autoTable(doc, {
      head,
      body: sanitizedBody,
      startY: logoLoaded ? 40 : 45,
      theme: 'grid',
      headStyles: { fillColor: [22, 160, 133], textColor: [255, 255, 255] },
      styles: { fontSize: 10, cellPadding: 2 },
    });

    if (outputType === 'blob') {
      const blob = doc.output('blob');
      if (!blob) {
        throw new Error('Failed to generate PDF blob');
      }
      return blob;
    } else {
      doc.save(fileName);
      return null;
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error; // Rethrow to allow caller to handle
  }
};