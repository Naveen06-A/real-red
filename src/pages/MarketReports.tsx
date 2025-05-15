import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart,
  Chart as ChartJS,
  ChartOptions,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  ScriptableContext,
  Title,
  Tooltip,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import moment from 'moment';
import { useEffect, useState, useCallback } from 'react';
import { Bar, Line, Pie } from 'react-chartjs-2';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { debounce } from 'lodash';

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

interface Property {
  id: string;
  name: string;
  property_type: string;
  street_number: string;
  street_name: string;
  suburb: string;
  price: number;
  user_id: string;
  created_at: string;
  agent_name?: string;
  agency_name?: string;
  category?: 'Listing' | 'Sold' | 'Under Offer';
  sale_type?: 'Private Treaty' | 'Auction' | 'EOI';
  listed_date?: string;
  sale_date?: string | null;
  expected_price?: number;
  sold_price?: number | null;
  expected_growth?: number;
}

interface ReportMetrics {
  listingsBySuburb: Record<string, { listed: number; sold: number }>;
  salesByAgent: Record<string, number>;
  salesByAgency: Record<string, number>;
  daysOnMarketByAgent: Record<string, number>;
  daysOnMarketByAgency: Record<string, number>;
  avgSalePriceBySuburb: Record<string, number>;
  avgSalePriceByAgent: Record<string, number>;
  avgSalePriceByAgency: Record<string, number>;
  commissionByAgent: Record<string, number>;
  commissionByAgency: Record<string, number>;
  salesByCategory: Record<string, number>;
  unsoldBySuburb: Record<string, number>;
  undersoldOversold: { undersold: number; oversold: number };
  predictedAvgPriceBySuburb: Record<string, number>;
  priceTrendsBySuburb: Record<string, Record<string, number>>;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

export function MarketReports() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [report, setReport] = useState<ReportMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSuburb, setFilterSuburb] = useState<string>('All');
  const [filterAgent, setFilterAgent] = useState<string>('All');
  const [filterTime, setFilterTime] = useState<string>('All');
  const [chartTheme, setChartTheme] = useState<'light' | 'dark'>('light');
  const location = useLocation();
  const userProperty = location.state?.liveData as Property | undefined;

  useEffect(() => {
    fetchProperties();
  }, []);

  const debouncedGenerateReport = useCallback(
    debounce((data: Property[]) => generateReport(data), 300),
    [filterSuburb, filterAgent, filterTime]
  );

  async function fetchProperties() {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching properties from Supabase...');

      const { data, error } = await supabase
        .from('properties')
        .select('id, name, property_type, street_number, street_name, suburb, price, user_id, created_at, agent_name, agency_name, category, sale_type, listed_date, sale_date, expected_price, sold_price, expected_growth')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const propertiesWithUserData = userProperty ? [...(data || []), userProperty] : data || [];
      setProperties(propertiesWithUserData);
      debouncedGenerateReport(propertiesWithUserData);
    } catch (error: any) {
      console.error('Error fetching properties:', error.message);
      setError(error.message || 'Failed to fetch properties from Supabase');
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }

  const calculateDaysOnMarket = (listedDate: string | null | undefined, saleDate: string | null | undefined) => {
    const start = listedDate ? new Date(listedDate) : new Date();
    const end = saleDate ? new Date(saleDate) : new Date();
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  const predictFutureAvgPriceBySuburb = (suburb: string, filteredProperties: Property[]) => {
    const relevantData = filteredProperties.filter(p => p.suburb === suburb && (p.sold_price || p.price));
    if (relevantData.length < 2) return relevantData[0]?.price || 0;

    const prices = relevantData.map(p => p.sold_price || p.price);
    const growthRates = relevantData.map(p => p.expected_growth || 0).filter(g => g !== 0);
    const avgGrowth = growthRates.length > 0 ? growthRates.reduce((sum, g) => sum + g, 0) / growthRates.length : 0;

    const n = prices.length;
    let xSum = 0, ySum = 0, xySum = 0, xSquaredSum = 0;
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

  const generateReport = (data: Property[]) => {
    let filteredData = [...data];
    if (filterSuburb !== 'All') filteredData = filteredData.filter(p => p.suburb === filterSuburb);
    if (filterAgent !== 'All') filteredData = filteredData.filter(p => p.agent_name === filterAgent);
    if (filterTime !== 'All') {
      const [start, end] = filterTime.split('-');
      filteredData = filteredData.filter(p => {
        const date = new Date(p.sale_date || p.created_at);
        return date >= new Date(start) && date <= new Date(end);
      });
    }

    const listingsBySuburb: Record<string, { listed: number; sold: number }> = {};
    const salesByAgent: Record<string, number> = {};
    const salesByAgency: Record<string, number> = {};
    const daysOnMarketByAgent: Record<string, number> = {};
    const daysOnMarketByAgency: Record<string, number> = {};
    const avgSalePriceBySuburb: Record<string, number> = {};
    const avgSalePriceByAgent: Record<string, number> = {};
    const avgSalePriceByAgency: Record<string, number> = {};
    const commissionByAgent: Record<string, number> = {};
    const commissionByAgency: Record<string, number> = {};
    const salesByCategory: Record<string, number> = {};
    const unsoldBySuburb: Record<string, number> = {};
    const predictedAvgPriceBySuburb: Record<string, number> = {};
    const priceTrendsBySuburb: Record<string, Record<string, number>> = {};
    let undersold = 0;
    let oversold = 0;

    filteredData.forEach((prop) => {
      const suburb = prop.suburb;
      if (!suburb) return;

      listingsBySuburb[suburb] = listingsBySuburb[suburb] || { listed: 0, sold: 0 };
      listingsBySuburb[suburb].listed += 1;
      if (prop.category === 'Sold') listingsBySuburb[suburb].sold += 1;

      if (prop.category === 'Sold' && prop.agent_name && prop.agency_name) {
        salesByAgent[prop.agent_name] = (salesByAgent[prop.agent_name] || 0) + 1;
        salesByAgency[prop.agency_name] = (salesByAgency[prop.agency_name] || 0) + 1;
      }

      if (prop.listed_date) {
        const days = calculateDaysOnMarket(prop.listed_date, prop.sale_date);
        if (prop.category === 'Sold' && prop.agent_name && prop.agency_name) {
          daysOnMarketByAgent[prop.agent_name] = ((daysOnMarketByAgent[prop.agent_name] || 0) + days) / (salesByAgent[prop.agent_name] || 1);
          daysOnMarketByAgency[prop.agency_name] = ((daysOnMarketByAgency[prop.agency_name] || 0) + days) / (salesByAgency[prop.agency_name] || 1);
        }
      }

      const price = prop.sold_price || prop.price;
      if (price) {
        avgSalePriceBySuburb[suburb] = ((avgSalePriceBySuburb[suburb] || 0) + price) / (listingsBySuburb[suburb].sold || listingsBySuburb[suburb].listed);
        if (prop.agent_name) avgSalePriceByAgent[prop.agent_name] = ((avgSalePriceByAgent[prop.agent_name] || 0) + price) / (salesByAgent[prop.agent_name] || 1);
        if (prop.agency_name) avgSalePriceByAgency[prop.agency_name] = ((avgSalePriceByAgency[prop.agency_name] || 0) + price) / (salesByAgency[prop.agency_name] || 1);
      }

      if (price && prop.agent_name && prop.agency_name) {
        const commission = price * 0.025;
        commissionByAgent[prop.agent_name] = (commissionByAgent[prop.agent_name] || 0) + commission;
        commissionByAgency[prop.agency_name] = (commissionByAgency[prop.agency_name] || 0) + commission;
      }

      if (prop.category === 'Sold' && prop.sale_type) salesByCategory[prop.sale_type] = (salesByCategory[prop.sale_type] || 0) + 1;

      if (prop.category === 'Listing') unsoldBySuburb[suburb] = (unsoldBySuburb[suburb] || 0) + 1;

      if (prop.sold_price && prop.expected_price) {
        if (prop.sold_price < prop.expected_price) undersold += 1;
        else if (prop.sold_price > prop.expected_price) oversold += 1;
      }

      predictedAvgPriceBySuburb[suburb] = predictFutureAvgPriceBySuburb(suburb, filteredData);

      const date = moment(prop.sale_date || prop.created_at).format('YYYY-MM');
      priceTrendsBySuburb[suburb] = priceTrendsBySuburb[suburb] || {};
      priceTrendsBySuburb[suburb][date] = ((priceTrendsBySuburb[suburb][date] || 0) + price) / (filteredData.filter(p => p.suburb === suburb && moment(p.sale_date || p.created_at).format('YYYY-MM') === date).length);
    });

    setReport({
      listingsBySuburb,
      salesByAgent,
      salesByAgency,
      daysOnMarketByAgent,
      daysOnMarketByAgency,
      avgSalePriceBySuburb,
      avgSalePriceByAgent,
      avgSalePriceByAgency,
      commissionByAgent,
      commissionByAgency,
      salesByCategory,
      unsoldBySuburb,
      undersoldOversold: { undersold, oversold },
      predictedAvgPriceBySuburb,
      priceTrendsBySuburb,
    });
  };

  const getThemeColors = () => {
    return chartTheme === 'light'
      ? {
          background: 'rgba(255, 255, 255, 0.9)',
          border: '#333',
          text: '#333',
          colors: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
        }
      : {
          background: 'rgba(30, 30, 30, 0.9)',
          border: '#fff',
          text: '#fff',
          colors: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD', '#D4A5A5'],
        };
  };

  const renderCharts = () => {
    if (!report) return null;

    const theme = getThemeColors();

    const heatmapData = {
      labels: Array.from(new Set(Object.values(report.priceTrendsBySuburb).flatMap(trends => Object.keys(trends)))).sort(),
      datasets: Object.keys(report.priceTrendsBySuburb).map(suburb => ({
        label: suburb,
        data: Object.keys(report.priceTrendsBySuburb[suburb]).map(date => ({
          x: date,
          y: suburb,
          v: report.priceTrendsBySuburb[suburb][date] || 0,
        })),
        backgroundColor: (ctx: ScriptableContext<'bar'>) => {
          const value = (ctx.raw as { v: number })?.v || 0;
          const alpha = Math.min(value / 1000000, 1);
          return `${theme.colors[0].replace(')', `, ${alpha})`)}`;
        },
      })),
    };

    const suburbSalesData = {
      labels: Object.keys(report.listingsBySuburb),
      datasets: [
        { label: 'Listed', data: Object.values(report.listingsBySuburb).map(d => d.listed), backgroundColor: theme.colors[1], stack: 'Stack 0' },
        { label: 'Sold', data: Object.values(report.listingsBySuburb).map(d => d.sold), backgroundColor: theme.colors[2], stack: 'Stack 0' },
        { label: 'Unsold', data: Object.values(report.unsoldBySuburb), backgroundColor: theme.colors[3], stack: 'Stack 0' },
      ],
    };

    const avgPriceData = {
      labels: Object.keys(report.avgSalePriceBySuburb),
      datasets: [
        { label: 'Historical Avg Price', data: Object.values(report.avgSalePriceBySuburb), borderColor: theme.colors[0], backgroundColor: `${theme.colors[0]}33`, fill: true, tension: 0.4 },
        { label: 'Predicted Avg Price', data: Object.values(report.predictedAvgPriceBySuburb), borderColor: theme.colors[1], borderDash: [5, 5], fill: false },
      ],
    };

    const salesByAgentData = {
      labels: Object.keys(report.salesByAgent),
      datasets: [{
        data: Object.values(report.salesByAgent),
        backgroundColor: theme.colors,
        hoverOffset: 20,
        borderWidth: 2,
        borderColor: theme.border,
      }],
    };

    const heatmapOptions: ChartOptions<'bar'> = {
      responsive: true,
      plugins: {
        legend: { position: 'top', labels: { color: theme.text } },
        title: { display: true, text: 'Price Trends Heatmap (Suburbs Over Time)', font: { size: 18 }, color: theme.text },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency((ctx.raw as { v: number }).v)}` } },
      },
      scales: {
        x: { title: { display: true, text: 'Time (YYYY-MM)', color: theme.text }, ticks: { color: theme.text } },
        y: { title: { display: true, text: 'Suburb', color: theme.text }, ticks: { color: theme.text } },
      },
      animation: { duration: 1000, easing: 'easeInOutQuad' as const },
    };

    const stackedBarOptions: ChartOptions<'bar'> = {
      responsive: true,
      plugins: { legend: { position: 'top', labels: { color: theme.text } }, title: { display: true, text: 'Property Status by Suburb', font: { size: 18 }, color: theme.text } },
      scales: { 
        x: { stacked: true, ticks: { color: theme.text } }, 
        y: { stacked: true, title: { display: true, text: 'Count', color: theme.text }, ticks: { color: theme.text } },
      },
      animation: { duration: 1000, easing: 'easeInOutQuad' as const },
    };

    const lineOptions: ChartOptions<'line'> = {
      responsive: true,
      plugins: {
        legend: { position: 'top', labels: { color: theme.text } },
        title: { display: true, text: 'Price Trends by Suburb', font: { size: 18 }, color: theme.text },
      },
      scales: { 
        y: { ticks: { callback: (value) => formatCurrency(value as number), color: theme.text }, title: { display: true, text: 'Price', color: theme.text } },
        x: { ticks: { color: theme.text } },
      },
      animation: { duration: 1000, easing: 'easeInOutQuad' as const },
    };

    const pieOptions: ChartOptions<'pie'> = {
      responsive: true,
      plugins: {
        legend: { position: 'right', labels: { color: theme.text } },
        title: { display: true, text: 'Sales Distribution by Agent (3D Effect)', font: { size: 18 }, color: theme.text },
        datalabels: {
          color: '#fff',
          font: { weight: 'bold' as const, size: 14 },
          formatter: (value: number, ctx: { chart: Chart; dataIndex: number }) => {
            const labels = ctx.chart.data.labels as string[] | undefined;
            return labels && labels[ctx.dataIndex] ? `${labels[ctx.dataIndex]}: ${value}` : `${value}`;
          },
          textShadowBlur: 10,
          textShadowColor: 'rgba(0, 0, 0, 0.7)',
          rotation: (ctx: { chart: Chart; dataIndex: number }) => ctx.dataIndex * 10,
        },
      },
      animation: { duration: 1500, easing: 'easeOutBounce' as const },
    };

    return (
      <div className="space-y-12">
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Filters & Settings</h2>
            <button
              onClick={() => setChartTheme(chartTheme === 'light' ? 'dark' : 'light')}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Toggle {chartTheme === 'light' ? 'Dark' : 'Light'} Theme
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-700 mb-2">Suburb</label>
              <select value={filterSuburb} onChange={(e) => { setFilterSuburb(e.target.value); debouncedGenerateReport(properties); }} className="w-full p-2 border rounded">
                <option value="All">All</option>
                {Array.from(new Set(properties.map(p => p.suburb))).map(suburb => (
                  <option key={suburb} value={suburb}>{suburb}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-700 mb-2">Agent</label>
              <select value={filterAgent} onChange={(e) => { setFilterAgent(e.target.value); debouncedGenerateReport(properties); }} className="w-full p-2 border rounded">
                <option value="All">All</option>
                {Array.from(new Set(properties.map(p => p.agent_name).filter(Boolean))).map(agent => (
                  <option key={agent} value={agent}>{agent}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-700 mb-2">Time Period</label>
              <select value={filterTime} onChange={(e) => { setFilterTime(e.target.value); debouncedGenerateReport(properties); }} className="w-full p-2 border rounded">
                <option value="All">All Time</option>
                <option value="2024-01-01-2024-12-31">2024</option>
                <option value="2023-01-01-2023-12-31">2023</option>
                <option value="2022-01-01-2022-12-31">2022</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <Bar data={heatmapData} options={heatmapOptions} />
          </div>
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <Bar data={suburbSalesData} options={stackedBarOptions} />
          </div>
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <Line data={avgPriceData} options={lineOptions} />
          </div>
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <Pie data={salesByAgentData} options={pieOptions} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`max-w-7xl mx-auto px-4 py-8 ${chartTheme === 'light' ? 'bg-gray-50' : 'bg-gray-900'}`}>
      <h1 className={`text-4xl font-bold mb-8 text-center ${chartTheme === 'light' ? 'text-gray-900' : 'text-white'}`}>
        Predictive Market Insights Dashboard
      </h1>
      {loading ? (
        <p className={`text-center animate-pulse ${chartTheme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>
          Loading market insights...
        </p>
      ) : error ? (
        <p className="text-center text-red-600">{error}</p>
      ) : !report ? (
        <p className={`text-center ${chartTheme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>
          No data available to display.
        </p>
      ) : (
        renderCharts()
      )}
    </div>
  );
}