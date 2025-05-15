import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Property } from '../types/Property';
import { PredictionResult } from '../pages/PropertyPrediction';
import { formatCurrency } from './formatters';
import { LoadingOverlay } from '../components/LoadingOverlay';
import ReactDOM from 'react-dom/client';

interface ReportOptions {
  includeSameStreetSales?: boolean;
  includePastRecords?: boolean;
  includePrediction?: boolean;
}

export const generatePDFReport = async (
  property: Property,
  prediction?: PredictionResult,
  options: ReportOptions = {}
) => {
  // Show loading overlay
  const loadingEl = document.createElement('div');
  document.body.appendChild(loadingEl);
  const root = ReactDOM.createRoot(loadingEl);
  root.render(<LoadingOverlay message="Generating PDF report..." />);

  try {
    const { includeSameStreetSales = true, includePastRecords = true, includePrediction = true } = options;
    const doc = new jsPDF();

    // Add logo
    const logoImg = new Image();
    logoImg.src = 'https://i.imgur.com/YourLogoURL.png'; // Replace with actual hosted logo URL
    await new Promise((resolve) => {
      logoImg.onload = resolve;
    });
    doc.addImage(logoImg, 'PNG', 20, 10, 40, 40);

    // Header
    doc.setFontSize(18);
    const fullAddress = `${property.street_number || ''} ${property.street_name || ''}, ${property.suburb}`;
    doc.text(`${fullAddress} - Property Report`, 20, 20);

    // Property Details
    const propertyData = [
      ['Property Type', property.property_type],
      ['Bedrooms', property.bedrooms.toString()],
      ['Bathrooms', property.bathrooms.toString()],
      ['Garage Spaces', property.car_garage.toString()],
      ['Floor Area (sqm)', property.sqm.toString()],
      ['Land Size (sqm)', property.landsize.toString()],
      ['Price', formatCurrency(property.price)],
      ['Expected Price', formatCurrency(property.expected_price)],
      ['Commission (%)', property.commission.toString()],
      ['Features', property.features.join(', ')],
      ['Listed Date', new Date(property.listed_date).toLocaleDateString()],
      ['Category', property.category],
      ['Sale Type', property.sale_type],
      ['Flood Risk', property.flood_risk || 'N/A'],
      ['Bushfire Risk', property.bushfire_risk || 'N/A'],
      ['Flood Notes', property.flood_notes || 'N/A'],
      ['Bushfire Notes', property.bushfire_notes || 'N/A'],
      ['Contract Status', property.contract_status || 'N/A'],
      ['Days on Market', property.days_on_market?.toString() || 'N/A'],
      ['Agent Name', property.agent_name],
      ['Agency Name', property.agency_name],
      ['Sold Price', property.sold_price ? formatCurrency(property.sold_price) : 'N/A'],
    ];

    autoTable(doc, {
      startY: 30,
      head: [['Field', 'Value']],
      body: propertyData,
    });

    // Same Street Sales
    if (includeSameStreetSales && property.same_street_sales?.length) {
      const salesData = property.same_street_sales.map((sale) => [
        sale.address,
        formatCurrency(sale.sale_price),
        sale.property_type,
        new Date(sale.sale_date).toLocaleDateString(),
      ]);
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['Address', 'Sale Price', 'Property Type', 'Sale Date']],
        body: salesData,
      });
    }

    // Past Records
    if (includePastRecords && property.past_records?.length) {
      const pastRecordsData = property.past_records.map((record) => [
        `${record.suburb}, ${record.postcode}`,
        record.property_type,
        record.price,
        record.bedrooms,
        record.bathrooms,
        record.car_garage,
        record.sqm,
        record.landsize,
        record.listing_date ? new Date(record.listing_date).toLocaleDateString() : 'N/A',
        record.sale_date ? new Date(record.sale_date).toLocaleDateString() : 'N/A',
        record.status || 'N/A',
        record.notes || 'N/A',
      ]);
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [
          ['Location', 'Type', 'Price', 'Beds', 'Baths', 'Garage', 'Floor Area', 'Land Size', 'Listing Date', 'Sale Date', 'Status', 'Notes'],
        ],
        body: pastRecordsData,
      });
    }

    // Prediction Data
    if (includePrediction && prediction) {
      const predictionData = [
        ['Recommendation', `${prediction.recommendation} (${prediction.confidence}%)`],
        ['Market Trend', `${prediction.trend.toFixed(1)}% (${prediction.marketCondition})`],
        ['Estimated Value', formatCurrency(prediction.estimatedValue || 0)],
        ['Best Time to Sell', prediction.bestTimeToSell || 'N/A'],
        ['Next Month Prediction', formatCurrency(prediction.nextPrice || 0)],
        ['Sentiment Score', prediction.sentimentScore?.toFixed(1) || 'N/A'],
      ];
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['Prediction Field', 'Value']],
        body: predictionData,
      });
    }

    // Footer
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, doc.internal.pageSize.height - 10);

    doc.save(`${fullAddress.replace(/[^a-zA-Z0-9]/g, '_')}_report.pdf`);
  } finally {
    // Remove loading overlay
    root.unmount();
    document.body.removeChild(loadingEl);
  }
};

export const generateJSONReport = (
  property: Property,
  prediction?: PredictionResult,
  aiInsights: string[] = []
) => {
  const report = {
    propertyDetails: property,
    predictionAnalysis: prediction || null,
    aiInsights,
    generatedAt: new Date().toISOString(),
    marketSummary: prediction
      ? {
          currentPrice: property.price,
          predictedPrice: prediction.nextPrice,
          trendDirection: prediction.marketCondition,
          recommendationStrength: prediction.confidence,
        }
      : null,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fullAddress = `${property.street_number || ''}${property.street_name || ''}_${property.suburb}`;
  a.href = url;
  a.download = `${fullAddress.replace(/[^a-zA-Z0-9]/g, '_')}_detailed_report.json`;
  a.click();
  URL.revokeObjectURL(url);
};