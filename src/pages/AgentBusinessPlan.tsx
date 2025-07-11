import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Target, 
  DollarSign, 
  CheckCircle, 
  TrendingUp, 
  FileText, 
  Home, 
  Phone, 
  Calendar,
  Settings,
  Save,
  RotateCcw,
  BarChart3,
  Download,
  Eye,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { toast } from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { Disclosure } from '@headlessui/react';

interface BusinessPlanTargets {
  id?: string;
  agent_id: string;
  period_type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  working_days: number;
  appraisals_target: number;
  listings_target: number;
  written_sales_target: number;
  settled_sales_target: number;
  net_commission_target: number;
  phone_calls_target: number;
  appraisal_to_listing_ratio: number;
  listing_to_written_ratio: number;
  fall_over_rate: number;
  avg_commission_per_sale: number;
  calls_per_settled_sale: number;
  created_at?: string;
  updated_at?: string;
}

interface RatioSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
  tooltip: string;
}

const RatioSlider: React.FC<RatioSliderProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  tooltip
}) => (
  <div className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200 relative group">
    <div className="flex justify-between items-center mb-2">
      <span className="text-sm font-medium text-blue-800">{label}</span>
      <span className="text-sm text-blue-600">{value}{suffix}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
      style={{
        background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${((value - min) / (max - min)) * 100}%, #BFDBFE ${((value - min) / (max - min)) * 100}%, #BFDBFE 100%)`
      }}
    />
    <div className="flex justify-between text-xs text-blue-500 mt-1">
      <span>{min}{suffix}</span>
      <span>{max}{suffix}</span>
    </div>
    <div className="absolute z-10 hidden group-hover:block bg-blue-800 text-white text-xs rounded py-2 px-4 -top-10 left-1/2 transform -translate-x-1/2 w-64">
      {tooltip}
    </div>
  </div>
);

export function AgentBusinessPlan() {
  const { user } = useAuthStore();
  const [targets, setTargets] = useState<BusinessPlanTargets>({
    agent_id: user?.id || '',
    period_type: 'monthly',
    working_days: 0,
    appraisals_target: 0,
    listings_target: 0,
    written_sales_target: 0,
    settled_sales_target: 0,
    net_commission_target: 0,
    phone_calls_target: 0,
    appraisal_to_listing_ratio: 0,
    listing_to_written_ratio: 0,
    fall_over_rate: 0,
    avg_commission_per_sale: 0,
    calls_per_settled_sale: 300,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchBusinessPlan();
    }
  }, [user?.id]);

  useEffect(() => {
    recalculateTargets();
  }, [
    targets.net_commission_target,
    targets.avg_commission_per_sale,
    targets.fall_over_rate,
    targets.appraisal_to_listing_ratio,
    targets.listing_to_written_ratio,
    targets.calls_per_settled_sale,
    targets.period_type,
    targets.working_days
  ]);

  const recalculateTargets = () => {
    const { 
      net_commission_target, 
      avg_commission_per_sale, 
      fall_over_rate,
      appraisal_to_listing_ratio,
      listing_to_written_ratio,
      calls_per_settled_sale,
      period_type,
      working_days 
    } = targets;

    const settled_sales_target = avg_commission_per_sale > 0 
      ? Math.ceil(net_commission_target / avg_commission_per_sale)
      : 0;

    const written_sales_target = fall_over_rate < 100 
      ? Math.ceil(settled_sales_target / (1 - fall_over_rate / 100))
      : 0;

    const listings_target = listing_to_written_ratio > 0
      ? Math.ceil(written_sales_target / (listing_to_written_ratio / 100))
      : 0;

    const appraisals_target = appraisal_to_listing_ratio > 0
      ? Math.ceil(listings_target / (appraisal_to_listing_ratio / 100))
      : 0;

    const phone_calls_target = calls_per_settled_sale > 0
      ? Math.ceil(settled_sales_target * calls_per_settled_sale / 0.1)
      : 0;

    const multiplier = period_type === 'daily' ? 1 :
                      working_days === 0 ? 1 :
                      period_type === 'weekly' ? (working_days || 5) / 5 :
                      period_type === 'monthly' ? (working_days || 20) :
                      (working_days || 240);

    setTargets(prev => ({
      ...prev,
      settled_sales_target: Math.round(settled_sales_target * (period_type === 'daily' ? 1 : multiplier)),
      written_sales_target: Math.round(written_sales_target * (period_type === 'daily' ? 1 : multiplier)),
      listings_target: Math.round(listings_target * (period_type === 'daily' ? 1 : multiplier)),
      appraisals_target: Math.round(appraisals_target * (period_type === 'daily' ? 1 : multiplier)),
      phone_calls_target: Math.round(phone_calls_target * (period_type === 'daily' ? 1 : multiplier))
    }));
  };

  const fetchBusinessPlan = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('agent_business_plans')
        .select('*')
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setTargets(data);
      }
    } catch (error: any) {
      console.error('Error fetching business plan:', error);
      toast.error('Failed to load business plan');
    } finally {
      setLoading(false);
    }
  };

  const saveBusinessPlan = async () => {
    if (!user?.id) return;

    setSaving(true);
    try {
      const planData = {
        ...targets,
        agent_id: user.id,
        updated_at: new Date().toISOString()
      };

      if (targets.id) {
        const { error } = await supabase
          .from('agent_business_plans')
          .update(planData)
          .eq('id', targets.id);
        
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('agent_business_plans')
          .insert([{ ...planData, created_at: new Date().toISOString() }])
          .select()
          .single();
        
        if (error) throw error;
        setTargets(data);
      }

      toast.success('Business plan saved successfully!');
    } catch (error: any) {
      console.error('Error saving business plan:', error);
      toast.error('Failed to save business plan');
    } finally {
      setSaving(false);
    }
  };

  const downloadPlan = () => {
    setDownloading(true);
    // Calculate default working days outside the template literal
    const defaultWorkingDays = targets.period_type === 'weekly' ? 5 :
                             targets.period_type === 'monthly' ? 20 : 240;
    const workingDaysDisplay = targets.working_days || `Default (${defaultWorkingDays})`;

    const latexContent = `
\\documentclass[a4paper,12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{geometry}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{lastpage}
\\usepackage{enumitem}
\\geometry{margin=1in}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{\\textbf{Agent Business Plan}}
\\rhead{Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
\\cfoot{Page \\thepage\\ of \\pageref{LastPage}}

\\begin{document}

\\begin{center}
  \\vspace*{1cm}
  \\Huge \\textbf{Agent Business Plan} \\\\
  \\large Generated for Agent ID: ${targets.agent_id || 'N/A'} \\\\
  \\vspace{0.5cm}
  \\normalsize Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
\\end{center}

\\vspace{1cm}

\\section*{Period Configuration}
\\begin{description}[leftmargin=0cm]
  \\item[Type:] ${targets.period_type.charAt(0).toUpperCase() + targets.period_type.slice(1)}
  \\item[Working Days:] ${workingDaysDisplay}
\\end{description}

\\section*{Targets}
\\begin{tabular}{l r}
  \\toprule
  \\textbf{Target} & \\textbf{Value} \\\\
  \\midrule
  Net Commission & \\$ ${targets.net_commission_target.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \\\\
  Average Commission per Sale & \\$ ${targets.avg_commission_per_sale.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \\\\
  Settled Sales & ${targets.settled_sales_target.toLocaleString()} \\\\
  Written Sales & ${targets.written_sales_target.toLocaleString()} \\\\
  Listings & ${targets.listings_target.toLocaleString()} \\\\
  Appraisals & ${targets.appraisals_target.toLocaleString()} \\\\
  Phone Calls & ${targets.phone_calls_target.toLocaleString()} \\\\
  \\bottomrule
\\end{tabular}

\\section*{Daily Targets}
\\begin{tabular}{l r}
  \\toprule
  \\textbf{Target} & \\textbf{Daily Value} \\\\
  \\midrule
  Net Commission & \\$ ${dailyTargets.commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \\\\
  Average Commission per Sale & \\$ ${targets.avg_commission_per_sale.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \\\\
  Settled Sales & ${dailyTargets.settled_sales.toLocaleString()} \\\\
  Written Sales & ${dailyTargets.written_sales.toLocaleString()} \\\\
  Listings & ${dailyTargets.listings.toLocaleString()} \\\\
  Appraisals & ${dailyTargets.appraisals.toLocaleString()} \\\\
  Phone Calls & ${dailyTargets.phone_calls_target.toLocaleString()} \\\\
  \\bottomrule
\\end{tabular}

\\section*{Performance Ratios}
\\begin{description}[leftmargin=0cm]
  \\item[Fall Over Rate:] ${targets.fall_over_rate}\\\%
  \\item[Appraisal to Listing Ratio:] ${targets.appraisal_to_listing_ratio}\\\%
  \\item[Listing to Written Ratio:] ${targets.listing_to_written_ratio}\\\%
  \\item[Calls per Settled Sale:] ${targets.calls_per_settled_sale}
\\end{description}

\\section*{Metadata}
\\begin{description}[leftmargin=0cm]
  \\item[Created At:] ${targets.created_at || 'N/A'}
  \\item[Updated At:] ${targets.updated_at || 'N/A'}
\\end{description}

\\end{document}
    `;

    setTimeout(() => {
      const blob = new Blob([latexContent], { type: 'application/x-tex' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `business_plan_${new Date().toISOString().split('T')[0]}.tex`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloading(false);
      toast.success('PDF plan downloaded (LaTeX file). Compile with latexmk to generate PDF.');
    }, 1000); // Simulate processing time
  };

  const resetToDefaults = () => {
    setTargets({
      agent_id: user?.id || '',
      period_type: 'monthly',
      working_days: 0,
      appraisals_target: 0,
      listings_target: 0,
      written_sales_target: 0,
      settled_sales_target: 0,
      net_commission_target: 0,
      phone_calls_target: 0,
      appraisal_to_listing_ratio: 0,
      listing_to_written_ratio: 0,
      fall_over_rate: 0,
      avg_commission_per_sale: 0,
      calls_per_settled_sale: 300,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  };

  const calculateDailyTargets = () => {
    const multiplier = targets.period_type === 'daily' ? 1 :
                      targets.working_days === 0 ? 1 :
                      targets.period_type === 'weekly' ? (targets.working_days || 5) / 5 :
                      targets.period_type === 'monthly' ? (targets.working_days || 20) :
                      (working_days || 240);

    return {
      appraisals: Math.round(targets.appraisals_target / multiplier),
      listings: Math.round(targets.listings_target / multiplier),
      written_sales: Math.round(targets.written_sales_target / multiplier),
      settled_sales: Math.round(targets.settled_sales_target / multiplier),
      phone_calls: Math.round(targets.phone_calls_target / multiplier),
      commission: Number((targets.net_commission_target / multiplier).toFixed(2))
    };
  };

  const dailyTargets = calculateDailyTargets();

  const chartData = [
    { name: 'Appraisals', value: targets.appraisals_target, fill: '#1E3A8A' },
    { name: 'Listings', value: targets.listings_target, fill: '#3B82F6' },
    { name: 'Written Sales', value: targets.written_sales_target, fill: '#60A5FA' },
    { name: 'Settled Sales', value: targets.settled_sales_target, fill: '#93C5FD' },
    { name: 'Phone Calls', value: targets.phone_calls_target, fill: '#BFDBFE' },
    { name: 'Commission ($)', value: targets.net_commission_target, fill: '#2563EB' }
  ];

  const targetCards = [
    { 
      title: 'Net Commission Target', 
      value: targets.net_commission_target, 
      daily: dailyTargets.commission, 
      icon: DollarSign, 
      color: 'bg-blue-600', 
      bgColor: 'bg-blue-100', 
      isCurrency: true,
      field: 'net_commission_target'
    },
    { 
      title: 'Avg Commission Per Sale', 
      value: targets.avg_commission_per_sale, 
      daily: targets.avg_commission_per_sale,
      icon: DollarSign, 
      color: 'bg-blue-500', 
      bgColor: 'bg-blue-100', 
      isCurrency: true,
      field: 'avg_commission_per_sale'
    },
    { 
      title: 'Settled Sales Target', 
      value: targets.settled_sales_target, 
      daily: dailyTargets.settled_sales, 
      icon: CheckCircle, 
      color: 'bg-blue-700', 
      bgColor: 'bg-blue-100',
      field: 'settled_sales_target'
    },
    { 
      title: 'Written Sales Target', 
      value: targets.written_sales_target, 
      daily: dailyTargets.written_sales, 
      icon: TrendingUp, 
      color: 'bg-blue-600', 
      bgColor: 'bg-blue-100',
      field: 'written_sales_target'
    },
    { 
      title: 'Listings Target', 
      value: targets.listings_target, 
      daily: dailyTargets.listings, 
      icon: FileText, 
      color: 'bg-blue-500', 
      bgColor: 'bg-blue-100',
      field: 'listings_target'
    },
    { 
      title: 'Appraisals Target', 
      value: targets.appraisals_target, 
      daily: dailyTargets.appraisals, 
      icon: Home, 
      color: 'bg-blue-600', 
      bgColor: 'bg-blue-100',
      field: 'appraisals_target'
    },
    { 
      title: 'Phone Calls Target', 
      value: targets.phone_calls_target, 
      daily: dailyTargets.phone_calls, 
      icon: Phone, 
      color: 'bg-blue-600', 
      bgColor: 'bg-blue-100',
      field: 'phone_calls_target'
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-blue-900 flex items-center">
                <Target className="w-8 h-8 mr-3 text-blue-600" />
                Agent Business Plan
              </h1>
              <p className="text-blue-600 mt-2">Configure your dynamic business targets</p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={resetToDefaults}
                className="flex items-center px-4 py-2 bg-blue-200 text-blue-700 rounded-lg hover:bg-blue-300 transition-colors"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </button>
              <button
                onClick={saveBusinessPlan}
                disabled={saving}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Plan'}
              </button>
              <button
                onClick={downloadPlan}
                disabled={downloading}
                className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-blue-400"
              >
                <Download className="w-4 h-4 mr-2" />
                {downloading ? 'Generating PDF...' : 'Download PDF'}
              </button>
              <button
                onClick={() => setShowPlan(true)}
                className="flex items-center px-4 py-2 bg-blue-400 text-white rounded-lg hover:bg-blue-500 transition-colors"
              >
                <Eye className="w-4 h-4 mr-2" />
                View Plan
              </button>
            </div>
          </div>
        </motion.div>

        {/* View Plan Modal */}
        {showPlan && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-blue-900 flex items-center">
                  <FileText className="w-6 h-6 mr-2 text-blue-600" />
                  Business Plan Details
                </h2>
                <button
                  onClick={() => setShowPlan(false)}
                  className="p-2 rounded-full hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="space-y-4">
                <Disclosure defaultOpen>
                  {({ open }) => (
                    <>
                      <Disclosure.Button className="flex justify-between w-full px-4 py-2 text-sm font-medium text-left text-blue-900 bg-blue-100 rounded-lg hover:bg-blue-200 focus:outline-none">
                        <span>Period Configuration</span>
                        <svg className={`${open ? 'transform rotate-180' : ''} w-5 h-5 text-blue-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </Disclosure.Button>
                      <Disclosure.Panel className="px-4 pt-4 pb-2 text-sm text-blue-700">
                        <p><strong>Type:</strong> {targets.period_type.charAt(0).toUpperCase() + targets.period_type.slice(1)}</p>
                        <p><strong>Working Days:</strong> {targets.working_days || `Default (${targets.period_type === 'weekly' ? 5 : targets.period_type === 'monthly' ? 20 : 240})`}</p>
                      </Disclosure.Panel>
                    </>
                  )}
                </Disclosure>
                <Disclosure defaultOpen>
                  {({ open }) => (
                    <>
                      <Disclosure.Button className="flex justify-between w-full px-4 py-2 text-sm font-medium text-left text-blue-900 bg-blue-100 rounded-lg hover:bg-blue-200 focus:outline-none">
                        <span>Targets</span>
                        <svg className={`${open ? 'transform rotate-180' : ''} w-5 h-5 text-blue-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </Disclosure.Button>
                      <Disclosure.Panel className="px-4 pt-4 pb-2 text-sm text-blue-700">
                        <p><strong>Net Commission:</strong> ${targets.net_commission_target.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p><strong>Avg Commission per Sale:</strong> ${targets.avg_commission_per_sale.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p><strong>Settled Sales:</strong> {targets.settled_sales_target.toLocaleString()}</p>
                        <p><strong>Written Sales:</strong> {targets.written_sales_target.toLocaleString()}</p>
                        <p><strong>Listings:</strong> {targets.listings_target.toLocaleString()}</p>
                        <p><strong>Appraisals:</strong> {targets.appraisals_target.toLocaleString()}</p>
                        <p><strong>Phone Calls:</strong> {targets.phone_calls_target.toLocaleString()}</p>
                      </Disclosure.Panel>
                    </>
                  )}
                </Disclosure>
                <Disclosure defaultOpen>
                  {({ open }) => (
                    <>
                      <Disclosure.Button className="flex justify-between w-full px-4 py-2 text-sm font-medium text-left text-blue-900 bg-blue-100 rounded-lg hover:bg-blue-200 focus:outline-none">
                        <span>Daily Targets</span>
                        <svg className={`${open ? 'transform rotate-180' : ''} w-5 h-5 text-blue-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </Disclosure.Button>
                      <Disclosure.Panel className="px-4 pt-4 pb-2 text-sm text-blue-700">
                        <p><strong>Net Commission:</strong> ${dailyTargets.commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p><strong>Avg Commission per Sale:</strong> ${targets.avg_commission_per_sale.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p><strong>Settled Sales:</strong> {dailyTargets.settled_sales.toLocaleString()}</p>
                        <p><strong>Written Sales:</strong> {dailyTargets.written_sales.toLocaleString()}</p>
                        <p><strong>Listings:</strong> {dailyTargets.listings.toLocaleString()}</p>
                        <p><strong>Appraisals:</strong> {dailyTargets.appraisals.toLocaleString()}</p>
                        <p><strong>Phone Calls:</strong> {dailyTargets.phone_calls.toLocaleString()}</p>
                      </Disclosure.Panel>
                    </>
                  )}
                </Disclosure>
                <Disclosure defaultOpen>
                  {({ open }) => (
                    <>
                      <Disclosure.Button className="flex justify-between w-full px-4 py-2 text-sm font-medium text-left text-blue-900 bg-blue-100 rounded-lg hover:bg-blue-200 focus:outline-none">
                        <span>Ratios</span>
                        <svg className={`${open ? 'transform rotate-180' : ''} w-5 h-5 text-blue-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </Disclosure.Button>
                      <Disclosure.Panel className="px-4 pt-4 pb-2 text-sm text-blue-700">
                        <p><strong>Fall Over Rate:</strong> {targets.fall_over_rate}%</p>
                        <p><strong>Appraisal to Listing Ratio:</strong> {targets.appraisal_to_listing_ratio}%</p>
                        <p><strong>Listing to Written Ratio:</strong> {targets.listing_to_written_ratio}%</p>
                        <p><strong>Calls per Settled Sale:</strong> {targets.calls_per_settled_sale}</p>
                      </Disclosure.Panel>
                    </>
                  )}
                </Disclosure>
                <Disclosure defaultOpen>
                  {({ open }) => (
                    <>
                      <Disclosure.Button className="flex justify-between w-full px-4 py-2 text-sm font-medium text-left text-blue-900 bg-blue-100 rounded-lg hover:bg-blue-200 focus:outline-none">
                        <span>Metadata</span>
                        <svg className={`${open ? 'transform rotate-180' : ''} w-5 h-5 text-blue-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </Disclosure.Button>
                      <Disclosure.Panel className="px-4 pt-4 pb-2 text-sm text-blue-700">
                        <p><strong>Created At:</strong> {targets.created_at || 'N/A'}</p>
                        <p><strong>Updated At:</strong> {targets.updated_at || 'N/A'}</p>
                      </Disclosure.Panel>
                    </>
                  )}
                </Disclosure>
              </div>
              <div className="mt-4 flex justify-end space-x-3">
                <button
                  onClick={downloadPlan}
                  disabled={downloading}
                  className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {downloading ? 'Generating PDF...' : 'Download PDF'}
                </button>
                <button
                  onClick={() => setShowPlan(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Period Selector and Working Days */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg p-6 shadow-sm border border-blue-200 mb-8"
        >
          <h2 className="text-lg font-semibold mb-4 text-blue-900 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-blue-600" />
            Period Configuration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-blue-700 mb-2">Target Period</label>
              <select
                value={targets.period_type}
                onChange={(e) => setTargets({ ...targets, period_type: e.target.value as 'daily' | 'weekly' | 'monthly' | 'yearly' })}
                className="w-full px-4 py-3 border border-blue-300 rounded-lg focus:ring-blue-500 focus:border-blue-600 bg-blue-50 text-blue-800"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-blue-700 mb-2">Working Days</label>
              <input
                type="number"
                value={targets.working_days}
                onChange={(e) => setTargets({ ...targets, working_days: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-full px-4 py-3 border border-blue-300 rounded-lg focus:ring-blue-500 focus:border-blue-600 bg-blue-50 text-blue-800"
                min="0"
                placeholder="Enter working days"
              />
            </div>
          </div>
        </motion.div>

        {/* Targets Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg p-6 shadow-sm border border-blue-200 mb-8"
        >
          <h2 className="text-lg font-semibold mb-4 text-blue-900 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
            Targets
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-blue-100">
                  <th className="p-3 border-b text-blue-700">Target</th>
                  <th className="p-3 border-b text-blue-700">Value</th>
                  <th className="p-3 border-b text-blue-700">Daily Value</th>
                </tr>
              </thead>
              <tbody>
                {targetCards.map((card) => (
                  <tr key={card.title} className="border-b hover:bg-blue-50">
                    <td className="p-3 flex items-center">
                      <div className={`${card.color} p-2 rounded-lg text-white mr-2`}>
                        <card.icon className="w-5 h-5" />
                      </div>
                      <span className="text-blue-700">{card.title}</span>
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        value={card.value}
                        onChange={(e) => {
                          if (['settled_sales_target', 'written_sales_target', 'listings_target', 'appraisals_target', 'phone_calls_target'].includes(card.field)) {
                            return; // Prevent changes to calculated fields
                          }
                          const value = Math.max(0, parseFloat(e.target.value) || 0);
                          setTargets(prev => ({
                            ...prev,
                            [card.field as keyof BusinessPlanTargets]: value
                          }));
                        }}
                        disabled={['settled_sales_target', 'written_sales_target', 'listings_target', 'appraisals_target', 'phone_calls_target'].includes(card.field)}
                        className="w-full px-2 py-1 border border-blue-300 rounded-lg focus:ring-blue-500 focus:border-blue-600 bg-blue-50 text-blue-800 disabled:bg-blue-200 disabled:cursor-not-allowed"
                        placeholder={`Enter ${card.title.toLowerCase().replace(' target', '')}`}
                        min="0"
                        step={card.isCurrency ? "0.01" : "1"}
                      />
                    </td>
                    <td className="p-3 text-blue-600">
                      <motion.span
                        key={card.daily}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        {card.isCurrency ? `$${card.daily.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : card.daily.toLocaleString()}
                      </motion.span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Ratios Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg p-6 shadow-sm border border-blue-200"
        >
          <h2 className="text-lg font-semibold mb-6 text-blue-900 flex items-center">
            <Settings className="w-5 h-5 mr-2 text-blue-600" />
            Performance Ratios
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <RatioSlider
              label="Fall Over Rate"
              value={targets.fall_over_rate}
              onChange={(value) => setTargets({ ...targets, fall_over_rate: value })}
              min={0}
              max={50}
              step={0.5}
              suffix="%"
              tooltip="Percentage of written sales that don't settle (fall over)"
            />
            <RatioSlider
              label="Appraisal to Listing Ratio"
              value={targets.appraisal_to_listing_ratio}
              onChange={(value) => setTargets({ ...targets, appraisal_to_listing_ratio: value })}
              min={0}
              max={100}
              step={1}
              suffix="%"
              tooltip="Percentage of appraisals that convert to listings"
            />
            <RatioSlider
              label="Listing to Written Ratio"
              value={targets.listing_to_written_ratio}
              onChange={(value) => setTargets({ ...targets, listing_to_written_ratio: value })}
              min={0}
              max={100}
              step={1}
              suffix="%"
              tooltip="Percentage of listings that convert to written sales"
            />
            <RatioSlider
              label="Calls per Settled Sale"
              value={targets.calls_per_settled_sale}
              onChange={(value) => setTargets({ ...targets, calls_per_settled_sale: value })}
              min={100}
              max={1000}
              step={10}
              suffix=""
              tooltip="Number of calls required to achieve one settled sale (assuming 10% answer rate)"
            />
          </div>
        </motion.div>

        {/* Chart Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg p-6 shadow-sm border border-blue-200 mb-8"
        >
          <h2 className="text-lg font-semibold mb-4 text-blue-900 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
            Target Visualization
          </h2>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#BFDBFE" />
                <XAxis dataKey="name" stroke="#1E3A8A" />
                <YAxis yAxisId="left" stroke="#1E3A8A" />
                <YAxis yAxisId="right" orientation="right" stroke="#2563EB" domain={[0, Math.max(targets.net_commission_target * 1.2, 1000)]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#EFF6FF', borderColor: '#3B82F6' }}
                  formatter={(value: number, name: string) => [
                    name === 'Commission ($)' ? `$${value.toLocaleString()}` : value.toLocaleString(),
                    name
                  ]}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="value" name="Count Targets" fillOpacity={0.8}>
                  <LabelList dataKey="value" position="top" formatter={(value: number) => value.toLocaleString()} fill="#1E3A8A" />
                </Bar>
                <Bar yAxisId="right" dataKey={chartData[5].value} name="Commission ($)" fill="#2563EB">
                  <LabelList dataKey="value" position="top" formatter={(value: number) => `$${value.toLocaleString()}`} fill="#2563EB" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Summary Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 bg-gradient-to-r from-blue-100 to-blue-200 rounded-lg p-6 border border-blue-300"
        >
          <h2 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
            Performance Summary
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-2xl font-bold text-blue-600">
                {targets.appraisals_target > 0 ? Math.round((targets.listings_target / targets.appraisals_target) * 100) : 0}%
              </div>
              <div className="text-sm text-blue-600">Listing Conversion Rate</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-2xl font-bold text-blue-600">
                ${targets.avg_commission_per_sale ? targets.avg_commission_per_sale.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </div>
              <div className="text-sm text-blue-600">Avg Commission per Sale</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-2xl font-bold text-blue-600">
                {targets.settled_sales_target > 0 ? `$${Math.round(targets.net_commission_target / targets.settled_sales_target).toLocaleString()}` : '$0'}
              </div>
              <div className="text-sm text-blue-600">Net Commission per Settled Sale</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-2xl font-bold text-blue-600">
                {targets.working_days || 0}
              </div>
              <div className="text-sm text-blue-600">Working Days</div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default AgentBusinessPlan;