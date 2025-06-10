import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  ChartOptions,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { motion } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ChevronDown, Download, Filter, Loader2, RefreshCcw, Trash2, X } from 'lucide-react';
import moment from 'moment';
import { useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { useLocation, useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { calculateCommission, formatArray, formatCurrency, formatDate, generateHeatmapData, generatePriceTrendsData, normalizeSuburb, selectStyles } from '../reportsUtils';
import { Filters, PropertyDetails } from './Reports';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels
);

const ITEMS_PER_PAGE = 10;

interface PropertyReportPageProps {
  // Define any additional props if needed
}

export function PropertyReportPage(props: PropertyReportPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    propertyMetrics,
    filteredProperties = [], // Default to empty array
    filters,
    filterSuggestions,
    manualInputs,
    filterPreviewCount,
    currentPage,
  } = location.state || {};

  const [localFilters, setLocalFilters] = useState<Filters>(filters || {
    suburbs: [],
    streetNames: [],
    streetNumbers: [],
    agents: [],
    agency_names: [],
  });
  const [localManualInputs, setLocalManualInputs] = useState(manualInputs || {
    suburbs: '',
    streetNames: '',
    streetNumbers: '',
    agents: '',
    agency_names: '',
  });
  const [localFilterPreviewCount, setLocalFilterPreviewCount] = useState(filterPreviewCount || 0);
  const [localCurrentPage, setLocalCurrentPage] = useState(currentPage || 1);
  const [exportLoading, setExportLoading] = useState(false);
  const [expandedFilters, setExpandedFilters] = useState({
    suburbs: false,
    streetNames: false,
    streetNumbers: false,
    agents: false,
    agency_names: false,
  });

  const propertiesTableRef = useRef<HTMLDivElement>(null);

  const paginatedProperties = useMemo(() => {
    const start = (localCurrentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filteredProperties?.slice(start, end) || [];
  }, [filteredProperties, localCurrentPage]);

  const totalPages = Math.ceil((filteredProperties?.length || 0) / ITEMS_PER_PAGE);

  // Error handling for invalid filteredProperties
  if (!Array.isArray(filteredProperties)) {
    console.error('filteredProperties is not an array');
    return <p className="text-red-600 text-center">Invalid property data</p>;
  }

  const applyFilters = (newFilters: Filters) => {
    try {
      console.log('Applying filters:', newFilters);
      const filtered = filteredProperties.filter((prop: PropertyDetails) => {
        const suburbMatch =
          newFilters.suburbs.length === 0 ||
          newFilters.suburbs.some((suburb: string) => normalizeSuburb(prop.suburb || '') === normalizeSuburb(suburb));
        const streetNameMatch =
          newFilters.streetNames.length === 0 ||
          newFilters.streetNames.some((name: string) => (prop.street_name || '').toLowerCase() === name.toLowerCase());
        const streetNumberMatch =
          newFilters.streetNumbers.length === 0 ||
          newFilters.streetNumbers.some((num: string) => (prop.street_number || '').toLowerCase() === num.toLowerCase());
        const agentMatch =
          newFilters.agents.length === 0 ||
          newFilters.agents.some((agent: string) => (prop.agent_name || '').toLowerCase() === agent.toLowerCase());
        const agencyMatch =
          newFilters.agency_names.length === 0 ||
          newFilters.agency_names.some((agency: string) => (prop.agency_name || 'Unknown').toLowerCase() === agency.toLowerCase());

        return suburbMatch && streetNameMatch && streetNumberMatch && agentMatch && agencyMatch;
      });
      console.log('Filtered properties:', filtered.length);
      setLocalFilterPreviewCount(filtered.length);
      setLocalCurrentPage(1);
    } catch (err) {
      console.error('Error applying filters:', err);
      toast.error('Failed to apply filters');
    }
  };

  const handleFilterChange = (filterType: keyof Filters, selected: Array<{ value: string; label: string }>) => {
    try {
      const newValues = selected.map((option) => option.value);
      console.log(`Filter changed: ${filterType} =`, newValues);
      setLocalFilters((prev: Filters) => {
        const newFilters = { ...prev, [filterType]: newValues };
        applyFilters(newFilters);
        localStorage.setItem('reportFilters', JSON.stringify(newFilters));
        return newFilters;
      });
    } catch (err) {
      console.error('Error in handleFilterChange:', err);
      toast.error('Failed to update filters');
    }
  };

  const handleManualInputChange = (filterType: keyof typeof localManualInputs, value: string) => {
    setLocalManualInputs((prev) => ({ ...prev, [filterType]: value }));
  };

  const handleManualInputKeyDown = (
    filterType: keyof Filters,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Enter') {
      const value = localManualInputs[filterType].trim();
      if (value && filterSuggestions[filterType]?.includes(value)) {
        console.log(`Adding manual input for ${filterType}: ${value}`);
        setLocalFilters((prev: Filters) => {
          const newValues = [...new Set([...prev[filterType], value])];
          const newFilters: Filters = { ...prev, [filterType]: newValues };
          applyFilters(newFilters);
          localStorage.setItem('reportFilters', JSON.stringify(newFilters));
          return newFilters;
        });
        setLocalManualInputs((prev) => ({ ...prev, [filterType]: '' }));
        toast.success(`Added ${filterType.replace(/s$/, '')}: ${value}`);
      } else {
        toast.error(`Invalid ${filterType.replace(/s$/, '')}. Please select from suggestions.`);
      }
    }
  };

  const resetFilters = () => {
    try {
      const emptyFilters: Filters = { suburbs: [], streetNames: [], streetNumbers: [], agents: [], agency_names: [] };
      console.log('Resetting filters');
      setLocalFilters(emptyFilters);
      setLocalManualInputs({ suburbs: '', streetNames: '', streetNumbers: '', agents: '', agency_names: '' });
      setExpandedFilters({ suburbs: false, streetNames: false, streetNumbers: false, agents: false, agency_names: false });
      setLocalFilterPreviewCount(filteredProperties.length);
      localStorage.removeItem('reportFilters');
      toast.success('Filters reset successfully');
      setLocalCurrentPage(1);
    } catch (err) {
      console.error('Error resetting filters:', err);
      toast.error('Failed to reset filters');
    }
  };

  const toggleFilterSection = (section: keyof typeof expandedFilters) => {
    setExpandedFilters((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleDeleteProperty = async (propertyId: string) => {
    try {
      if (!confirm('Are you sure you want to delete this property?')) return;

      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', propertyId);

      if (error) {
        console.error('Error deleting property:', error);
        throw new Error(`Failed to delete property: ${error.message}`);
      }

      toast.success('Property deleted successfully');
      navigate('/reports'); // Navigate back to refresh data
    } catch (err: any) {
      console.error('Delete error:', err);
      toast.error(err.message || 'Failed to delete property');
    }
  };

  const exportPropertyReportPDF = async () => {
    if (!propertyMetrics) {
      toast.error('No property metrics available for export');
      return;
    }
    setExportLoading(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text('Property Report', 20, 20);
      doc.setFontSize(12);
      doc.text(`Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`, 20, 30);
      doc.setFontSize(10);
      doc.text('Generated by xAI Property Management', 20, 38);

      autoTable(doc, {
        startY: 50,
        head: [
          [
            'Street Number', 'Street Name', 'Suburb', 'Postcode', 'Agent', 'Type', 'Price', 'Sold Price', 'Status',
            'Commission (%)', 'Commission Earned', 'Agency', 'Expected Price', 'Sale Type', 'Bedrooms', 'Bathrooms',
            'Car Garage', 'SQM', 'Land Size', 'Listed Date', 'Sold Date', 'Flood Risk', 'Bushfire Risk', 'Contract Status',
            'Features',
          ],
        ],
        body: propertyMetrics.propertyDetails.map((prop: PropertyDetails) => [
          prop.street_number || 'N/A',
          prop.street_name || 'N/A',
          normalizeSuburb(prop.suburb || ''),
          prop.postcode || 'N/A',
          prop.agent_name || 'N/A',
          prop.property_type || 'N/A',
          formatCurrency(prop.price || 0),
          prop.sold_price ? formatCurrency(prop.sold_price) : 'N/A',
          prop.category || 'N/A',
          prop.commission ? `${prop.commission}%` : 'N/A',
          prop.commission_earned ? formatCurrency(prop.commission_earned) : 'N/A',
          prop.agency_name || 'N/A',
          prop.expected_price ? formatCurrency(prop.expected_price) : 'N/A',
          prop.sale_type || 'N/A',
          prop.bedrooms ?? 'N/A',
          prop.bathrooms ?? 'N/A',
          prop.car_garage ?? 'N/A',
          prop.sqm ?? 'N/A',
          prop.landsize ?? 'N/A',
          formatDate(prop.listed_date),
          formatDate(prop.sold_date),
          prop.flood_risk || 'N/A',
          prop.bushfire_risk || 'N/A',
          prop.contract_status || 'N/A',
          formatArray(prop.features || []),
        ]),
        theme: 'striped',
        headStyles: { fillColor: '#60A5FA', textColor: '#fff' },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 20 },
          2: { cellWidth: 20 },
          3: { cellWidth: 15 },
          4: { cellWidth: 20 },
          5: { cellWidth: 15 },
          6: { cellWidth: 20 },
          7: { cellWidth: 20 },
          8: { cellWidth: 15 },
          9: { cellWidth: 15 },
          10: { cellWidth: 20 },
          11: { cellWidth: 20 },
          12: { cellWidth: 15 },
          13: { cellWidth: 15 },
          14: { cellWidth: 10 },
          15: { cellWidth: 10 },
          16: { cellWidth: 10 },
          17: { cellWidth: 10 },
          18: { cellWidth: 10 },
          19: { cellWidth: 15 },
          20: { cellWidth: 15 },
          21: { cellWidth: 15 },
          22: { cellWidth: 15 },
          23: { cellWidth: 15 },
          24: { cellWidth: 25 },
        },
      });

      doc.setFontSize(8);
      doc.text(
        'xAI Property Management - Confidential Report',
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );

      doc.save('property_report.pdf');
      toast.success('PDF exported successfully');
    } catch (err) {
      toast.error('Failed to export PDF');
      console.error('PDF export error:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const exportPropertyReportCSV = async () => {
    if (!propertyMetrics) {
      toast.error('No property metrics available for export');
      return;
    }
    setExportLoading(true);
    try {
      const data = [
        ['Property Report'],
        [`Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`],
        ['Generated by xAI Property Management'],
        [],
        ['Property Details'],
        [
          'Street Number', 'Street Name', 'Suburb', 'Postcode', 'Agent', 'Type', 'Price', 'Sold Price', 'Status',
          'Commission (%)', 'Commission Earned', 'Agency', 'Expected Price', 'Sale Type', 'Bedrooms', 'Bathrooms',
          'Car Garage', 'SQM', 'Land Size', 'Listed Date', 'Sold Date', 'Flood Risk', 'Bushfire Risk', 'Contract Status',
          'Features',
        ],
        ...propertyMetrics.propertyDetails.map((prop: PropertyDetails) => [
          prop.street_number || 'N/A',
          prop.street_name || 'N/A',
          normalizeSuburb(prop.suburb || ''),
          prop.postcode || 'N/A',
          prop.agent_name || 'N/A',
          prop.property_type || 'N/A',
          formatCurrency(prop.price || 0),
          prop.sold_price ? formatCurrency(prop.sold_price) : 'N/A',
          prop.category || 'N/A',
          prop.commission ? `${prop.commission}%` : 'N/A',
          prop.commission_earned ? formatCurrency(prop.commission_earned) : 'N/A',
          prop.agency_name || 'N/A',
          prop.expected_price ? formatCurrency(prop.expected_price) : 'N/A',
          prop.sale_type || 'N/A',
          prop.bedrooms ?? 'N/A',
          prop.bathrooms ?? 'N/A',
          prop.car_garage ?? 'N/A',
          prop.sqm ?? 'N/A',
          prop.landsize ?? 'N/A',
          formatDate(prop.listed_date),
          formatDate(prop.sold_date),
          prop.flood_risk || 'N/A',
          prop.bushfire_risk || 'N/A',
          prop.contract_status || 'N/A',
          formatArray(prop.features || []),
        ]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Property Report');
      XLSX.writeFile(wb, 'property_report.csv');
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error('Failed to export CSV');
      console.error('CSV export error:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const exportPropertyReportHTML = async () => {
    if (!propertyMetrics) {
      toast.error('No property metrics available for export');
      return;
    }
    setExportLoading(true);
    try {
      const htmlContent = `
        <html>
          <head>
            <title>Property Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; background: #E0F2FE; }
              .container { max-width: 1200px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
              th { background-color: #60A5FA; color: white; }
              h1 { text-align: center; color: #1E3A8A; }
              .footer { text-align: center; color: #4B5563; font-size: 12px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Property Report</h1>
              <p>Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}</p>
              <p>Generated by xAI Property Management</p>
              <h2>Property Details</h2>
              <table>
                <tr>
                  <th>Street Number</th><th>Street Name</th><th>Suburb</th><th>Postcode</th><th>Agent</th><th>Type</th>
                  <th>Price</th><th>Sold Price</th><th>Status</th><th>Commission (%)</th><th>Commission Earned</th>
                  <th>Agency</th><th>Expected Price</th><th>Sale Type</th><th>Bedrooms</th><th>Bathrooms</th>
                  <th>Car Garage</th><th>SQM</th><th>Land Size</th><th>Listed Date</th><th>Sold Date</th>
                  <th>Flood Risk</th><th>Bushfire Risk</th><th>Contract Status</th><th>Features</th>
                </tr>
                ${propertyMetrics.propertyDetails
                  .map(
                    (prop: PropertyDetails) => `
                  <tr>
                    <td>${prop.street_number || 'N/A'}</td>
                    <td>${prop.street_name || 'N/A'}</td>
                    <td>${normalizeSuburb(prop.suburb || '')}</td>
                    <td>${prop.postcode || 'N/A'}</td>
                    <td>${prop.agent_name || 'N/A'}</td>
                    <td>${prop.property_type || 'N/A'}</td>
                    <td>${formatCurrency(prop.price || 0)}</td>
                    <td>${prop.sold_price ? formatCurrency(prop.sold_price) : 'N/A'}</td>
                    <td>${prop.category || 'N/A'}</td>
                    <td>${prop.commission ? `${prop.commission}%` : 'N/A'}</td>
                    <td>${prop.commission_earned ? formatCurrency(prop.commission_earned) : 'N/A'}</td>
                    <td>${prop.agency_name || 'N/A'}</td>
                    <td>${prop.expected_price ? formatCurrency(prop.expected_price) : 'N/A'}</td>
                    <td>${prop.sale_type || 'N/A'}</td>
                    <td>${prop.bedrooms ?? 'N/A'}</td>
                    <td>${prop.bathrooms ?? 'N/A'}</td>
                    <td>${prop.car_garage ?? 'N/A'}</td>
                    <td>${prop.sqm ?? 'N/A'}</td>
                    <td>${prop.landsize ?? 'N/A'}</td>
                    <td>${formatDate(prop.listed_date)}</td>
                    <td>${formatDate(prop.sold_date)}</td>
                    <td>${prop.flood_risk || 'N/A'}</td>
                    <td>${prop.bushfire_risk || 'N/A'}</td>
                    <td>${prop.contract_status || 'N/A'}</td>
                    <td>${formatArray(prop.features || [])}</td>
                  </tr>`
                  )
                  .join('')}
              </table>
              <div class="footer">xAI Property Management - Confidential Report</div>
            </div>
          </body>
        </html>
      `;
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'property_report.html';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('HTML exported successfully');
    } catch (err) {
      toast.error('Failed to export HTML');
      console.error('HTML export error:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const renderPropertyHeatmap = () => {
    try {
      const heatmapData = generateHeatmapData(propertyMetrics);
      if (!heatmapData || !propertyMetrics) {
        console.warn('No heatmap data available');
        return <p className="text-gray-500 text-center">No heatmap data available</p>;
      }

      const options: ChartOptions<'bar'> = {
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Sales Heatmap by Suburb', font: { size: 18, weight: 'bold' } },
          tooltip: {
            callbacks: {
              label: (context) => `Sales: ${context.raw}`,
            },
          },
        },
        scales: {
          y: { beginAtZero: true },
          x: { ticks: { font: { size: 12 } } },
        },
      };

      return <Bar data={{ ...heatmapData, datasets: [{ ...heatmapData.datasets[0], backgroundColor: '#60A5FA' }] }} options={options} />;
    } catch (err) {
      console.error('Error rendering heatmap:', err);
      return <p className="text-red-600 text-center">Failed to render heatmap</p>;
    }
  };

  const renderPriceTrends = () => {
    try {
      const priceTrendsData = generatePriceTrendsData(propertyMetrics);
      if (!priceTrendsData || !propertyMetrics) {
        console.warn('No price trends data available');
        return <p className="text-gray-500 text-center">No price trends data available</p>;
      }

      const options: ChartOptions<'bar'> = {
        plugins: {
          legend: { position: 'top', labels: { font: { size: 14 } } },
          title: { display: true, text: 'Price Trends by Suburb', font: { size: 18, weight: 'bold' } },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => formatCurrency(value as number), font: { size: 12 } },
          },
          x: { ticks: { font: { size: 12 } } },
        },
      };

      return <Bar data={{ ...priceTrendsData, datasets: priceTrendsData.datasets.map(ds => ({ ...ds, backgroundColor: '#60A5FA' })) }} options={options} />;
    } catch (err) {
      console.error('Error rendering price trends:', err);
      return <p className="text-red-600 text-center">Failed to render price trends</p>;
    }
  };

  const renderGeneralCharts = () => {
    if (!propertyMetrics) {
      console.warn('No property metrics for general charts');
      return <p className="text-gray-500 text-center">No chart data available</p>;
    }

    try {
      const avgPriceBySuburbData = {
        labels: Object.keys(propertyMetrics.avgSalePriceBySuburb) || [],
        datasets: [
          {
            label: 'Average Sale Price',
            data: Object.values(propertyMetrics.avgSalePriceBySuburb) || [],
            backgroundColor: '#60A5FA',
          },
          {
            label: 'Predicted Average Price',
            data: Object.values(propertyMetrics.predictedAvgPriceBySuburb) || [],
            backgroundColor: '#93C5FD',
          },
        ],
      };

      const avgPriceBySuburbOptions: ChartOptions<'bar'> = {
        plugins: {
          legend: { position: 'top', labels: { font: { size: 14 } } },
          datalabels: { display: false },
          title: { display: true, text: 'Average Sale Price by Suburb', font: { size: 18, weight: 'bold' } },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => formatCurrency(value as number), font: { size: 12 } },
          },
          x: { ticks: { font: { size: 12 } } },
        },
      };

      return (
        <div className="space-y-8">
          <motion.div
            className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 hover:shadow-xl transition-all duration-300"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-2xl font-semibold text-blue-800 mb-4 flex items-center">
              <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Average Sale Price by Suburb
            </h2>
            <Bar data={avgPriceBySuburbData} options={avgPriceBySuburbOptions} />
          </motion.div>
        </div>
      );
    } catch (err) {
      console.error('Error rendering general charts:', err);
      return <p className="text-red-600 text-center">Failed to render charts</p>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          className="flex justify-between items-center mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl font-semibold text-blue-800 flex items-center">
            <Filter className="w-6 h-6 mr-2 text-blue-600" />
            Property Report
          </h2>
          <motion.button
            onClick={() => navigate('/reports')}
            className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            aria-label="Back to dashboard"
          >
            <X className="w-6 h-6" />
          </motion.button>
        </motion.div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold text-blue-800 flex items-center">
              <Filter className="w-5 h-5 mr-2 text-blue-600" />
              Filters
            </h3>
            <motion.button
              onClick={resetFilters}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Reset all filters to default"
              aria-label="Reset all filters"
            >
              <RefreshCcw className="w-4 h-4 mr-2" />
              Reset Filters
            </motion.button>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Matching properties: <span className="font-semibold text-blue-600">{localFilterPreviewCount}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {(['suburbs', 'streetNames', 'streetNumbers', 'agents', 'agency_names'] as const).map((filterType) => (
              <motion.div
                key={filterType}
                className="border border-blue-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200"
                title={`Filter by ${filterType === 'agency_names' ? 'agency name' : filterType.replace(/s$/, '')}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <motion.button
                  onClick={() => toggleFilterSection(filterType)}
                  className={`w-full flex justify-between items-center p-4 font-medium rounded-t-xl ${
                    {
                      suburbs: 'bg-blue-50 text-blue-800 hover:bg-blue-100',
                      streetNames: 'bg-blue-50 text-blue-800 hover:bg-blue-100',
                      streetNumbers: 'bg-blue-50 text-blue-800 hover:bg-blue-100',
                      agents: 'bg-blue-50 text-blue-800 hover:bg-blue-100',
                      agency_names: 'bg-blue-50 text-blue-800 hover:bg-blue-100',
                    }[filterType]
                  } transition-colors`}
                  whileHover={{ scale: 1.02 }}
                  aria-expanded={expandedFilters[filterType]}
                  aria-controls={`filter-${filterType}`}
                >
                  <span>
                    {filterType === 'agency_names'
                      ? 'Agency Name'
                      : filterType.charAt(0).toUpperCase() + filterType.slice(1).replace(/s$/, '')}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 transition-transform ${expandedFilters[filterType] ? 'rotate-180' : ''}`}
                  />
                </motion.button>
                {expandedFilters[filterType] && (
                  <motion.div
                    id={`filter-${filterType}`}
                    className="p-4 bg-white rounded-b-xl"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <input
                      type="text"
                      value={localManualInputs[filterType]}
                      onChange={(e) => handleManualInputChange(filterType, e.target.value)}
                      onKeyDown={(e) => handleManualInputKeyDown(filterType, e)}
                      placeholder={`Enter ${filterType === 'agency_names' ? 'agency name' : filterType.replace(/s$/, '')} and press Enter`}
                      className="w-full p-3 mb-3 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-blue-50"
                      aria-label={`Enter ${filterType.replace(/s$/, '')}`}
                    />
                    <Select
                      isMulti
                      options={filterSuggestions[filterType]?.map((item: string) => ({
                        value: item,
                        label: item,
                      })) || []}
                      value={localFilters[filterType].map((item: string) => ({ value: item, label: item }))}
                      onChange={(selected) => handleFilterChange(filterType, selected)}
                      placeholder={`Select ${filterType === 'agency_names' ? 'agency name' : filterType.replace(/s$/, '')}...`}
                      styles={selectStyles}
                      noOptionsMessage={() => 'No options available'}
                      className="basic-multi-select"
                      classNamePrefix="select"
                      aria-label={`Select ${filterType.replace(/s$/, '')}`}
                    />
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
          <div className="mt-6 flex justify-end space-x-4 relative">
            {exportLoading && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center bg-blue-100 bg-opacity-50 rounded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              </motion.div>
            )}
            <motion.button
              onClick={() => exportPropertyReportPDF()}
              className="flex items-center px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Export property report as PDF"
              aria-label="Export as PDF"
              disabled={exportLoading}
            >
              <Download className="w-4 h-4 mr-2" />
              PDF
            </motion.button>
            <motion.button
              onClick={() => exportPropertyReportCSV()}
              className="flex items-center px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Export property report as CSV"
              aria-label="Export as CSV"
              disabled={exportLoading}
            >
              <Download className="w-4 h-4 mr-2" />
              CSV
            </motion.button>
            <motion.button
              onClick={() => exportPropertyReportHTML()}
              className="flex items-center px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Export property report as HTML"
              aria-label="Export as HTML"
              disabled={exportLoading}
            >
              <Download className="w-4 h-4 mr-2" />
              HTML
            </motion.button>
          </div>
        </div>

        {propertyMetrics ? (
          <>
            <motion.div
              className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 mb-6"
              ref={propertiesTableRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center">
                <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Property Details
              </h3>
              {paginatedProperties.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" role="grid">
                      <thead>
                        <tr className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                          <th className="p-4 text-left text-sm font-semibold">Street Number</th>
                          <th className="p-4 text-left text-sm font-semibold">Street Name</th>
                          <th className="p-4 text-left text-sm font-semibold">Suburb</th>
                          <th className="p-4 text-left text-sm font-semibold">Postcode</th>
                          <th className="p-4 text-left text-sm font-semibold">Agent Name</th>
                          <th className="p-4 text-left text-sm font-semibold">Property Type</th>
                          <th className="p-4 text-left text-sm font-semibold">Price</th>
                          <th className="p-4 text-left text-sm font-semibold">Sold Price</th>
                          <th className="p-4 text-left text-sm font-semibold">Status</th>
                          <th className="p-4 text-left text-sm font-semibold">Commission (%)</th>
                          <th className="p-4 text-left text-sm font-semibold">Commission Earned</th>
                          <th className="p-4 text-left text-sm font-semibold">Agency</th>
                          <th className="p-4 text-left text-sm font-semibold">Expected Price</th>
                          <th className="p-4 text-left text-sm font-semibold">Sale Type</th>
                          <th className="p-4 text-left text-sm font-semibold">Bedrooms</th>
                          <th className="p-4 text-left text-sm font-semibold">Bathrooms</th>
                          <th className="p-4 text-left text-sm font-semibold">Car Garage</th>
                          <th className="p-4 text-left text-sm font-semibold">SQM</th>
                          <th className="p-4 text-left text-sm font-semibold">Land Size</th>
                          <th className="p-4 text-left text-sm font-semibold">Listed Date</th>
                          <th className="p-4 text-left text-sm font-semibold">Sold Date</th>
                          <th className="p-4 text-left text-sm font-semibold">Flood Risk</th>
                          <th className="p-4 text-left text-sm font-semibold">Bushfire Risk</th>
                          <th className="p-4 text-left text-sm font-semibold">Contract Status</th>
                          <th className="p-4 text-left text-sm font-semibold">Features</th>
                          <th className="p-4 text-left text-sm font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedProperties.map((property: PropertyDetails) => {
                          const { commissionRate, commissionEarned } = calculateCommission(property);
                          return (
                            <motion.tr
                              key={property.id}
                              id={`property-${property.id}`}
                              className="border-b border-blue-200 hover:bg-blue-50 transition-colors"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.3 }}
                            >
                              <td className="p-4 text-gray-700">{property.street_number || 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.street_name || 'N/A'}</td>
                              <td className="p-4 text-gray-700">{normalizeSuburb(property.suburb || '') || 'UNKNOWN'}</td>
                              <td className="p-4 text-gray-700">{property.postcode || 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.agent_name || 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.property_type || 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.price ? formatCurrency(property.price) : 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.sold_price ? formatCurrency(property.sold_price) : 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.category || 'N/A'}</td>
                              <td className="p-4 text-gray-700">{commissionRate ? `${commissionRate}%` : 'N/A'}</td>
                              <td className="p-4 text-gray-700">{commissionEarned ? formatCurrency(commissionEarned) : 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.agency_name || 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.expected_price ? formatCurrency(property.expected_price) : 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.sale_type || 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.bedrooms ?? 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.bathrooms ?? 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.car_garage ?? 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.sqm ?? 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.landsize ?? 'N/A'}</td>
                              <td className="p-4 text-gray-700">{formatDate(property.listed_date)}</td>
                              <td className="p-4 text-gray-700">{formatDate(property.sold_date)}</td>
                              <td className="p-4 text-gray-700">{property.flood_risk || 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.bushfire_risk || 'N/A'}</td>
                              <td className="p-4 text-gray-700">{property.contract_status || 'N/A'}</td>
                              <td className="p-4 text-gray-700">{formatArray(property.features || [])}</td>
                              <td className="p-4 text-gray-700 flex space-x-2">
                                <motion.button
                                  onClick={() => {
                                    toast.info('Edit functionality not implemented in this view');
                                  }}
                                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  aria-label={`Edit property ${property.street_number} ${property.street_name}`}
                                >
                                  Edit
                                </motion.button>
                                <motion.button
                                  onClick={() => handleDeleteProperty(property.id)}
                                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  aria-label={`Delete property ${property.street_number} ${property.street_name}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </motion.button>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between items-center mt-4">
                    <motion.button
                      onClick={() => setLocalCurrentPage((p: number) => Math.max(p - 1, 1))}
                      disabled={localCurrentPage === 1}
                      className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      aria-label="Previous page"
                    >
                      Previous
                    </motion.button>
                    <span className="text-gray-700">
                      Page {localCurrentPage} of {totalPages}
                    </span>
                    <motion.button
                      onClick={() => setLocalCurrentPage((p: number) => Math.min(p + 1, totalPages))}
                      disabled={localCurrentPage === totalPages}
                      className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      aria-label="Next page"
                    >
                      Next
                    </motion.button>
                  </div>
                </>
              ) : (
                <p className="text-gray-500 text-center">No properties found matching the current filters.</p>
              )}
            </motion.div>

            <motion.div
              className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center">
                <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Sales Heatmap
              </h3>
              {renderPropertyHeatmap()}
            </motion.div>
            <motion.div
              className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center">
                <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Price Trends
              </h3>
              {renderPriceTrends()}
            </motion.div>
            <motion.div
              className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              {renderGeneralCharts()}
            </motion.div>
            <div className="flex justify-end space-x-4 relative">
              {exportLoading && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center bg-blue-100 bg-opacity-50 rounded"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                </motion.div>
              )}
              <motion.button
                onClick={() => exportPropertyReportPDF()}
                className="flex items-center px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Export property report as PDF"
                aria-label="Export as PDF"
                disabled={exportLoading}
              >
                <Download className="w-4 h-4 mr-2" />
                PDF
              </motion.button>
              <motion.button
                onClick={() => exportPropertyReportCSV()}
                className="flex items-center px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Export property report as CSV"
                aria-label="Export as CSV"
                disabled={exportLoading}
              >
                <Download className="w-4 h-4 mr-2" />
                CSV
              </motion.button>
              <motion.button
                onClick={() => exportPropertyReportHTML()}
                className="flex items-center px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Export property report as HTML"
                aria-label="Export as HTML"
                disabled={exportLoading}
              >
                <Download className="w-4 h-4 mr-2" />
                HTML
              </motion.button>
            </div>
          </>
        ) : (
          <p className="text-gray-500 text-center py-4">No property metrics available.</p>
        )}
      </div>
    </div>
  );
}

export default PropertyReportPage;