import { useEffect, useState, useCallback, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Download, Filter, BarChart, ArrowUpDown, Trash2, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { Dialog, Transition } from '@headlessui/react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import moment from 'moment';
import { Property } from '../types/Property';
import { debounce } from 'lodash';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface PropertyFormData {
  id: string;
  street_number: string;
  street_name: string;
  suburb: string;
  price: number;
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  car_garage: number;
  sqm: number;
  agent_name: string;
  agency_name: string;
  category: string;
}

interface PropertyMetrics {
  listingsBySuburb: Record<string, { listed: number; sold: number }>;
  avgSalePriceBySuburb: Record<string, number>;
  predictedAvgPriceBySuburb: Record<string, number>;
  priceTrendsBySuburb: Record<string, Record<string, number>>;
}

interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

const ITEMS_PER_PAGE = 10;

export function PropertyReport() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [metrics, setMetrics] = useState<PropertyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    suburb: '',
    streetName: '',
    streetNumber: '',
    agent: '',
    propertyType: '',
    priceRange: '',
    bedrooms: '',
    bathrooms: '',
    category: '',
  });
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: '', direction: 'asc' });
  const [filterSuggestions, setFilterSuggestions] = useState({
    suburbs: [] as string[],
    streetNames: [] as string[],
    agents: [] as string[],
    propertyTypes: [] as string[],
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<PropertyFormData | null>(null);
  const [formErrors, setFormErrors] = useState<Partial<PropertyFormData>>({});

  const handleEditClick = (property: Property) => {
    setEditingProperty({
      id: property.id,
      street_number: property.street_number || '',
      street_name: property.street_name || '',
      suburb: property.suburb || '',
      price: property.price || 0,
      property_type: property.property_type || '',
      bedrooms: property.bedrooms || 0,
      bathrooms: property.bathrooms || 0,
      car_garage: property.car_garage || 0,
      sqm: property.sqm || 0,
      agent_name: property.agent_name || '',
      agency_name: property.agency_name || '',
      category: property.category || '',
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProperty) return;

    const success = await updateProperty(editingProperty);
    if (success) {
      setIsEditModalOpen(false);
    }
  };

  const updateProperty = async (formData: PropertyFormData) => {
    try {
      const errors: Partial<PropertyFormData> = {};
      if (!formData.street_name) errors.street_name = 'Street name is required';
      if (!formData.suburb) errors.suburb = 'Suburb is required';
      if (formData.price <= 0) errors.price = 'Price must be greater than 0';
      if (!formData.property_type) errors.property_type = 'Property type is required';

      if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        return false;
      }

      const { error } = await supabase
        .from('properties')
        .update({
          street_number: formData.street_number,
          street_name: formData.street_name,
          suburb: formData.suburb,
          price: formData.price,
          property_type: formData.property_type,
          bedrooms: formData.bedrooms,
          bathrooms: formData.bathrooms,
          car_garage: formData.car_garage,
          sqm: formData.sqm,
          agent_name: formData.agent_name,
          agency_name: formData.agency_name,
          category: formData.category,
          updated_at: new Date().toISOString(),
        })
        .eq('id', formData.id);

      if (error) throw error;

      setProperties(prev =>
        prev.map(p =>
          p.id === formData.id ? { ...p, ...formData } : p
        )
      );
      setFilteredProperties(prev =>
        prev.map(p =>
          p.id === formData.id ? { ...p, ...formData } : p
        )
      );

      toast.success('Property updated successfully');
      setIsEditModalOpen(false);
      setEditingProperty(null);
      setFormErrors({});
      generateMetrics(properties.map(p =>
        p.id === formData.id ? { ...p, ...formData } : p
      ));
      return true;
    } catch (err: any) {
      toast.error('Failed to update property');
      console.error('Update error:', err);
      return false;
    }
  };

  const totalPages = Math.ceil(filteredProperties.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentProperties = filteredProperties.slice(startIndex, endIndex);

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      setProperties(data || []);
      setFilteredProperties(data || []);
      generateMetrics(data || []);
      updateFilterSuggestions(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch properties');
      toast.error(err.message || 'Failed to fetch properties');
    } finally {
      setLoading(false);
    }
  };

  const deleteProperty = async (propertyId: string) => {
    try {
      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', propertyId);

      if (error) throw error;

      setProperties(prev => prev.filter(p => p.id !== propertyId));
      setFilteredProperties(prev => prev.filter(p => p.id !== propertyId));
      toast.success('Property deleted successfully');
      generateMetrics(properties.filter(p => p.id !== propertyId));
    } catch (err: any) {
      toast.error('Failed to delete property');
      console.error('Delete error:', err);
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });

    const sortedProperties = [...filteredProperties].sort((a: any, b: any) => {
      if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredProperties(sortedProperties);
  };

  const updateFilterSuggestions = (data: Property[]) => {
    setFilterSuggestions({
      suburbs: [...new Set(data.map((p) => p.suburb).filter(Boolean))] as string[],
      streetNames: [...new Set(data.map((p) => p.street_name).filter(Boolean))] as string[],
      agents: [...new Set(data.map((p) => p.agent_name).filter(Boolean))] as string[],
      propertyTypes: [...new Set(data.map((p) => p.property_type).filter(Boolean))] as string[],
    });
  };

  const predictFutureAvgPriceBySuburb = (suburb: string, data: Property[]) => {
    const relevantData = data.filter((p) => p.suburb === suburb && (p.sold_price || p.price));
    if (relevantData.length < 2) return relevantData[0]?.price || 0;

    const prices = relevantData.map((p) => p.sold_price || p.price);
    const growthRates = relevantData
      .map((p) => p.expected_growth || 0)
      .filter((g) => g !== 0);
    const avgGrowth =
      growthRates.length > 0
        ? growthRates.reduce((sum, g) => sum + g, 0) / growthRates.length
        : 0;

    const n = prices.length;
    let xSum = 0,
      ySum = 0,
      xySum = 0,
      xSquaredSum = 0;
    prices.forEach((price, i) => {
      xSum += i;
      ySum += price;
      xySum += i * price;
      xSquaredSum += i * i;
    });
    const slope = (n * xySum - xSum * ySum) / (n * xSquaredSum - xSum * xSum);
    const intercept = (ySum - slope * xSum) / n;
    const historicalPrediction = slope * (n + 1) + intercept;
    return historicalPrediction * (1 + avgGrowth / 100);
  };

  const generateMetrics = useCallback(
    debounce((data: Property[]) => {
      const listingsBySuburb: Record<string, { listed: number; sold: number }> = {};
      const avgSalePriceBySuburb: Record<string, number> = {};
      const predictedAvgPriceBySuburb: Record<string, number> = {};
      const priceTrendsBySuburb: Record<string, Record<string, number>> = {};

      data.forEach((prop) => {
        const suburb = prop.suburb;
        if (!suburb) return;

        listingsBySuburb[suburb] = listingsBySuburb[suburb] || { listed: 0, sold: 0 };
        listingsBySuburb[suburb].listed += 1;
        if (prop.category === 'Sold') listingsBySuburb[suburb].sold += 1;

        const price = prop.sold_price || prop.price;
        if (price) {
          avgSalePriceBySuburb[suburb] =
            ((avgSalePriceBySuburb[suburb] || 0) + price) /
            (listingsBySuburb[suburb].sold || listingsBySuburb[suburb].listed);
        }

        predictedAvgPriceBySuburb[suburb] = predictFutureAvgPriceBySuburb(suburb, data);

        const date = moment(prop.sale_date || prop.created_at).format('YYYY-MM');
        priceTrendsBySuburb[suburb] = priceTrendsBySuburb[suburb] || {};
        priceTrendsBySuburb[suburb][date] =
          ((priceTrendsBySuburb[suburb][date] || 0) + price) /
          data.filter(
            (p) =>
              p.suburb === suburb &&
              moment(p.sale_date || p.created_at).format('YYYY-MM') === date
          ).length;
      });

      setMetrics({
        listingsBySuburb,
        avgSalePriceBySuburb,
        predictedAvgPriceBySuburb,
        priceTrendsBySuburb,
      });
    }, 300),
    []
  );

  const applyFilters = useCallback(
    debounce(() => {
      const filtered = properties.filter((p) => {
        const suburbMatch = filters.suburb ? p.suburb?.toLowerCase().includes(filters.suburb.toLowerCase()) : true;
        const streetNameMatch = filters.streetName
          ? p.street_name?.toLowerCase().includes(filters.streetName.toLowerCase())
          : true;
        const streetNumberMatch = filters.streetNumber
          ? p.street_number?.toLowerCase().includes(filters.streetNumber.toLowerCase())
          : true;
        const agentMatch = filters.agent
          ? p.agent_name?.toLowerCase().includes(filters.agent.toLowerCase())
          : true;
        const propertyTypeMatch = filters.propertyType
          ? p.property_type?.toLowerCase() === filters.propertyType.toLowerCase()
          : true;
        const categoryMatch = filters.category
          ? p.category?.toLowerCase() === filters.category.toLowerCase()
          : true;
        const bedroomsMatch = filters.bedrooms
          ? p.bedrooms === parseInt(filters.bedrooms)
          : true;
        const bathroomsMatch = filters.bathrooms
          ? p.bathrooms === parseInt(filters.bathrooms)
          : true;

        let priceMatch = true;
        if (filters.priceRange) {
          const [min, max] = filters.priceRange.split('-').map(Number);
          priceMatch = p.price >= min && p.price <= max;
        }

        return (
          suburbMatch &&
          streetNameMatch &&
          streetNumberMatch &&
          agentMatch &&
          propertyTypeMatch &&
          categoryMatch &&
          bedroomsMatch &&
          bathroomsMatch &&
          priceMatch
        );
      });

      setFilteredProperties(filtered);
      generateMetrics(filtered);
      setCurrentPage(1);
    }, 300),
    [properties, filters]
  );

  useEffect(() => {
    applyFilters();
  }, [filters, applyFilters]);

  const exportPropertyReportPDF = () => {
    if (!metrics) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Property Market Report', 20, 20);
    doc.setFontSize(10);
    doc.text('Generated by xAI Property Management', 20, 30);

    autoTable(doc, {
      startY: 40,
      head: [['Suburb', 'Listed', 'Sold', 'Avg Sale Price', 'Predicted Avg Price']],
      body: Object.keys(metrics.listingsBySuburb).map((suburb) => [
        suburb,
        metrics.listingsBySuburb[suburb].listed,
        metrics.listingsBySuburb[suburb].sold,
        formatCurrency(metrics.avgSalePriceBySuburb[suburb] || 0),
        formatCurrency(metrics.predictedAvgPriceBySuburb[suburb] || 0),
      ]),
      theme: 'striped',
      headStyles: { fillColor: '#FF6384', textColor: '#fff' },
    });

    doc.save('property_report.pdf');
  };

  const exportPropertyReportCSV = () => {
    if (!metrics) return;
    const data = [
      ['Property Market Report'],
      ['Generated by xAI Property Management'],
      [],
      ['Suburb', 'Listed', 'Sold', 'Avg Sale Price', 'Predicted Avg Price'],
      ...Object.keys(metrics.listingsBySuburb).map((suburb) => [
        suburb,
        metrics.listingsBySuburb[suburb].listed,
        metrics.listingsBySuburb[suburb].sold,
        formatCurrency(metrics.avgSalePriceBySuburb[suburb] || 0),
        formatCurrency(metrics.predictedAvgPriceBySuburb[suburb] || 0),
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Property Report');
    XLSX.writeFile(wb, 'property_report.csv');
  };

  const exportPropertyReportHTML = () => {
    if (!metrics) return;
    const htmlContent = `
      <html>
        <head>
          <title>Property Market Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f4f4f4; }
            .container { max-width: 800px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background-color: #FF6384; color: white; }
            h1 { text-align: center; color: #333; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Property Market Report</h1>
            <table>
              <tr><th>Suburb</th><th>Listed</th><th>Sold</th><th>Avg Sale Price</th><th>Predicted Avg Price</th></tr>
              ${Object.keys(metrics.listingsBySuburb)
                .map(
                  (suburb) => `
                <tr>
                  <td>${suburb}</td>
                  <td>${metrics.listingsBySuburb[suburb].listed}</td>
                  <td>${metrics.listingsBySuburb[suburb].sold}</td>
                  <td>${formatCurrency(metrics.avgSalePriceBySuburb[suburb] || 0)}</td>
                  <td>${formatCurrency(metrics.predictedAvgPriceBySuburb[suburb] || 0)}</td>
                </tr>`
                )
                .join('')}
            </table>
            <div class="footer">Generated by xAI Property Management</div>
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
  };

  const renderHeatmap = () => {
    if (!metrics) return null;

    const suburbs = Object.keys(metrics.listingsBySuburb);
    const maxSales = Math.max(...Object.values(metrics.listingsBySuburb).map((d) => d.sold));
    const heatmapData = {
      labels: suburbs,
      datasets: [
        {
          label: 'Sales Volume',
          data: suburbs.map((suburb) => metrics.listingsBySuburb[suburb].sold),
          backgroundColor: suburbs.map((suburb) => {
            const intensity = metrics.listingsBySuburb[suburb].sold / maxSales;
            return `rgba(255, 99, 132, ${intensity})`;
          }),
        },
      ],
    };

    const options: ChartOptions<'bar'> = {
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Sales Heatmap by Suburb' },
      },
      scales: {
        y: { beginAtZero: true },
      },
    };

    return <Bar data={heatmapData} options={options} />;
  };

  const renderPriceTrends = () => {
    if (!metrics) return null;

    const suburbs = Object.keys(metrics.priceTrendsBySuburb).slice(0, 3);
    const dates = Array.from(
      new Set(
        suburbs.flatMap((suburb) => Object.keys(metrics.priceTrendsBySuburb[suburb]))
      )
    ).sort();

    const datasets = suburbs.map((suburb) => ({
      label: suburb,
      data: dates.map((date) => metrics.priceTrendsBySuburb[suburb][date] || 0),
      backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'][suburbs.indexOf(suburb)],
    }));

    const data = {
      labels: dates,
      datasets,
    };

    const options: ChartOptions<'bar'> = {
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: 'Price Trends by Suburb' },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => formatCurrency(value as number) },
        },
      },
    };

    return <Bar data={data} options={options} />;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen text-red-600">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 flex items-center">
        <BarChart className="w-6 h-6 mr-2 text-blue-600" /> Property Market Report
      </h1>

      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Filter className="w-5 h-5 mr-2 text-blue-600" /> Filters
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-gray-700 font-medium mb-2">Suburb</label>
            <select
              value={filters.suburb}
              onChange={(e) => setFilters({ ...filters, suburb: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg"
            >
              <option value="">All Suburbs</option>
              {filterSuggestions.suburbs.map((suburb) => (
                <option key={suburb} value={suburb}>{suburb}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">Property Type</label>
            <select
              value={filters.propertyType}
              onChange={(e) => setFilters({ ...filters, propertyType: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg"
            >
              <option value="">All Types</option>
              {filterSuggestions.propertyTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg"
            >
              <option value="">All Categories</option>
              <option value="Listing">Listing</option>
              <option value="Sold">Sold</option>
              <option value="Under Offer">Under Offer</option>
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">Price Range</label>
            <select
              value={filters.priceRange}
              onChange={(e) => setFilters({ ...filters, priceRange: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg"
            >
              <option value="">All Prices</option>
              <option value="0-500000">Under $500,000</option>
              <option value="500000-1000000">$500,000 - $1,000,000</option>
              <option value="1000000-2000000">$1,000,000 - $2,000,000</option>
              <option value="2000000-999999999">Over $2,000,000</option>
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">Bedrooms</label>
            <select
              value={filters.bedrooms}
              onChange={(e) => setFilters({ ...filters, bedrooms: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg"
            >
              <option value="">Any</option>
              {[1, 2, 3, 4, 5, 6].map((num) => (
                <option key={num} value={num}>{num}+ Beds</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">Bathrooms</label>
            <select
              value={filters.bathrooms}
              onChange={(e) => setFilters({ ...filters, bathrooms: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg"
            >
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map((num) => (
                <option key={num} value={num}>{num}+ Baths</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">Agent</label>
            <select
              value={filters.agent}
              onChange={(e) => setFilters({ ...filters, agent: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg"
            >
              <option value="">All Agents</option>
              {filterSuggestions.agents.map((agent) => (
                <option key={agent} value={agent}>{agent}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">Street Name</label>
            <select
              value={filters.streetName}
              onChange={(e) => setFilters({ ...filters, streetName: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg"
            >
              <option value="">All Streets</option>
              {filterSuggestions.streetNames.map((street) => (
                <option key={street} value={street}>{street}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setFilters({
              suburb: '',
              streetName: '',
              streetNumber: '',
              agent: '',
              propertyType: '',
              priceRange: '',
              bedrooms: '',
              bathrooms: '',
              category: '',
            })}
            className="px-4 py-2 text-blue-600 hover:text-blue-800"
          >
            Clear All Filters
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : error ? (
        <div className="text-red-600 text-center p-4">{error}</div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property Details
                    <button onClick={() => handleSort('property_type')}>
                      <ArrowUpDown className="inline w-4 h-4 ml-1" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                    <button onClick={() => handleSort('suburb')}>
                      <ArrowUpDown className="inline w-4 h-4 ml-1" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                    <button onClick={() => handleSort('price')}>
                      <ArrowUpDown className="inline w-4 h-4 ml-1" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Features
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                    <button onClick={() => handleSort('category')}>
                      <ArrowUpDown className="inline w-4 h-4 ml-1" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Agent
                    <button onClick={() => handleSort('agent_name')}>
                      <ArrowUpDown className="inline w-4 h-4 ml-1" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentProperties.map((property) => (
                  <tr key={property.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {property.property_type}
                      </div>
                      <div className="text-sm text-gray-500">
                        ID: {property.id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {property.street_number} {property.street_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {property.suburb}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {formatCurrency(property.price)}
                      </div>
                      {property.sold_price && (
                        <div className="text-sm text-green-600">
                          Sold: {formatCurrency(property.sold_price)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {property.bedrooms} beds | {property.bathrooms} baths
                      </div>
                      <div className="text-sm text-gray-500">
                        {property.sqm}m² | {property.car_garage} parking
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${property.category === 'Sold' ? 'bg-green-100 text-green-800' : 
                          property.category === 'Under Offer' ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-blue-100 text-blue-800'}`}>
                        {property.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {property.agent_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {property.agency_name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditClick(property)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit Property"
                        >
                          <Pencil className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => deleteProperty(property.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete Property"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage(page => Math.max(page - 1, 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(page => Math.min(page + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                    <span className="font-medium">
                      {Math.min(endIndex, filteredProperties.length)}
                    </span>{' '}
                    of <span className="font-medium">{filteredProperties.length}</span> results
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                    >
                      <span className="sr-only">First</span>
                      <ChevronLeft className="h-5 w-5" />
                      <ChevronLeft className="h-5 w-5 -ml-2" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(page => Math.max(page - 1, 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                    >
                      <span className="sr-only">Previous</span>
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            currentPage === pageNum
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setCurrentPage(page => Math.min(page + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                    >
                      <span className="sr-only">Next</span>
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                    >
                      <span className="sr-only">Last</span>
                      <ChevronRight className="h-5 w-5" />
                      <ChevronRight className="h-5 w-5 -ml-2" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-4">
        <button
          onClick={exportPropertyReportPDF}
          className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <Download className="w-5 h-5 mr-2" />
          Export PDF
        </button>
        <button
          onClick={exportPropertyReportCSV}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Download className="w-5 h-5 mr-2" />
          Export Excel
        </button>
        <button
          onClick={exportPropertyReportHTML}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Download className="w-5 h-5 mr-2" />
          Export HTML
        </button>
      </div>

      <Transition appear show={isEditModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => setIsEditModalOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                    Edit Property
                  </Dialog.Title>
                  <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Street Number</label>
                      <input
                        type="text"
                        value={editingProperty?.street_number || ''}
                        onChange={(e) =>
                          setEditingProperty((prev) => prev ? { ...prev, street_number: e.target.value } : prev)
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Street Name</label>
                      <input
                        type="text"
                        value={editingProperty?.street_name || ''}
                        onChange={(e) =>
                          setEditingProperty((prev) => prev ? { ...prev, street_name: e.target.value } : prev)
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      />
                      {formErrors.street_name && (
                        <p className="mt-1 text-sm text-red-600">{formErrors.street_name}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Suburb</label>
                      <input
                        type="text"
                        value={editingProperty?.suburb || ''}
                        onChange={(e) =>
                          setEditingProperty((prev) => prev ? { ...prev, suburb: e.target.value } : prev)
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      />
                      {formErrors.suburb && (
                        <p className="mt-1 text-sm text-red-600">{formErrors.suburb}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Price</label>
                      <input
                        type="number"
                        value={editingProperty?.price || 0}
                        onChange={(e) =>
                          setEditingProperty((prev) => prev ? { ...prev, price: parseFloat(e.target.value) } : prev)
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      />
                      {formErrors.price && (
                        <p className="mt-1 text-sm text-red-600">{formErrors.price}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Property Type</label>
                      <input
                        type="text"
                        value={editingProperty?.property_type || ''}
                        onChange={(e) =>
                          setEditingProperty((prev) => prev ? { ...prev, property_type: e.target.value } : prev)
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      />
                      {formErrors.property_type && (
                        <p className="mt-1 text-sm text-red-600">{formErrors.property_type}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Bedrooms</label>
                      <input
                        type="number"
                        value={editingProperty?.bedrooms || 0}
                        onChange={(e) =>
                          setEditingProperty((prev) => prev ? { ...prev, bedrooms: parseInt(e.target.value) } : prev)
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Bathrooms</label>
                      <input
                        type="number"
                        value={editingProperty?.bathrooms || 0}
                        onChange={(e) =>
                          setEditingProperty((prev) => prev ? { ...prev, bathrooms: parseInt(e.target.value) } : prev)
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Car Garage</label>
                      <input
                        type="number"
                        value={editingProperty?.car_garage || 0}
                        onChange={(e) =>
                          setEditingProperty((prev) => prev ? { ...prev, car_garage: parseInt(e.target.value) } : prev)
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Square Meters</label>
                      <input
                        type="number"
                        value={editingProperty?.sqm || 0}
                        onChange={(e) =>
                          setEditingProperty((prev) => prev ? { ...prev, sqm: parseInt(e.target.value) } : prev)
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Agent Name</label>
                      <input
                        type="text"
                        value={editingProperty?.agent_name || ''}
                        onChange={(e) =>
                          setEditingProperty((prev) => prev ? { ...prev, agent_name: e.target.value } : prev)
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Agency Name</label>
                      <input
                        type="text"
                        value={editingProperty?.agency_name || ''}
                        onChange={(e) =>
                          setEditingProperty((prev) => prev ? { ...prev, agency_name: e.target.value } : prev)
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Category</label>
                      <select
                        value={editingProperty?.category || ''}
                        onChange={(e) =>
                          setEditingProperty((prev) => prev ? { ...prev, category: e.target.value } : prev)
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="">Select Category</option>
                        <option value="Listing">Listing</option>
                        <option value="Sold">Sold</option>
                        <option value="Under Offer">Under Offer</option>
                      </select>
                    </div>
                    <div className="mt-6 flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={() => setIsEditModalOpen(false)}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Save Changes
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {renderHeatmap()}
      {renderPriceTrends()}
    </div>
  );
}