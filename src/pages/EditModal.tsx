import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { X, Trash2, CheckCircle, Bug, ChevronDown, ChevronUp } from 'lucide-react';
import { PropertyDetails } from './Reports';

interface EditModalProps {
  showEditModal: boolean;
  setShowEditModal: React.Dispatch<React.SetStateAction<boolean>>;
  selectedProperty: PropertyDetails | null;
  setSelectedProperty: React.Dispatch<React.SetStateAction<PropertyDetails | null>>;
  properties: PropertyDetails[];
  setProperties: React.Dispatch<React.SetStateAction<PropertyDetails[]>>;
  filteredProperties: PropertyDetails[];
  setFilteredProperties: React.Dispatch<React.SetStateAction<PropertyDetails[]>>;
  debouncedGenerateMetrics: () => void;
  propertiesTableRef: React.RefObject<HTMLDivElement>;
  pauseSubscription: () => void;
  resumeSubscription: () => void;
}

// Utility function for deep comparison and diffing
function deepDiff(obj1: any, obj2: any): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {};
  for (const key in obj1) {
    const val1 = obj1[key] === '' ? undefined : obj1[key];
    const val2 = obj2[key] === '' ? undefined : obj2[key];
    if (JSON.stringify(val1) !== JSON.stringify(val2)) {
      changes[key] = { old: val1 ?? undefined, new: val2 ?? undefined };
    }
  }
  return changes;
}

export function EditModal({
  showEditModal,
  setShowEditModal,
  selectedProperty,
  setSelectedProperty,
  properties,
  setProperties,
  filteredProperties,
  setFilteredProperties,
  debouncedGenerateMetrics,
  propertiesTableRef,
  pauseSubscription,
  resumeSubscription,
}: EditModalProps) {
  const [formData, setFormData] = useState<Partial<PropertyDetails> | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [autoSaveDraft, setAutoSaveDraft] = useState<Partial<PropertyDetails> | null>(null);
  const [savedChanges, setSavedChanges] = useState<Record<string, { old: any; new: any }>>({});
  const [showChanges, setShowChanges] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Partial<PropertyDetails> | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState({
    address: true,
    pricing: true,
    details: true,
  });
  const modalRef = useRef<HTMLDivElement>(null);
  const originalStateRef = useRef<{
    properties: PropertyDetails[];
    filteredProperties: PropertyDetails[];
  } | null>(null);

  // Log to debug panel
  const logDebug = (message: string) => {
    setDebugLogs((prev) => [...prev, `[${new Date().toISOString()}] ${message}`].slice(-10));
  };

  // Reset modal state
  const resetModalState = () => {
    setFormData(null);
    setFormErrors({});
    setSavedChanges({});
    setShowChanges(false);
    setPendingUpdate(null);
    setAutoSaveDraft(null);
    logDebug('Modal state fully reset');
  };

  // Initialize formData
  useEffect(() => {
    if (selectedProperty) {
      resetModalState();
      const initialData: Partial<PropertyDetails> = {
        id: selectedProperty.id,
        street_number: selectedProperty.street_number || '',
        street_name: selectedProperty.street_name || '',
        suburb: selectedProperty.suburb || '',
        agent_name: selectedProperty.agent_name || '',
        price: selectedProperty.price || 0,
        sold_price: selectedProperty.sold_price || undefined,
        category: selectedPropertyDetails || '',
        property_type: '',
        agency_name: '',
        listed_date: '',
        sold_date: undefined,
        commission: undefined,
        sale_type: '',
        postcode: '',
        bedrooms: undefined,
        bathrooms: '',
        car_garage: undefined,
        sqm: undefined,
        landsize: undefined,
        flood_risk: '',
        property_details: undefined,
      };
      setFormData(initialData);
      setAutoSaveDraft(initialData);
      pauseSubscription(); // Pause subscription when modal opens
      logDebug(`Initialized formData: ${JSON.stringify(initialData, null, 2)}`);
    } else {
      resetModalState();
    }
  }, [selectedProperty, pauseSubscription]);

  // Auto-save to localStorage
  useEffect(() => {
    if (formData && selectedProperty) {
      const timeout = setTimeout(() => {
        localStorage.setItem(`property_draft_${selectedProperty.id}`, JSON.stringify(formData));
        logDebug(`Auto-saved draft: ${JSON.stringify(formData, null, 2)}`);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [formData, selectedProperty]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !showDeleteConfirm) handleCloseModal();
      if (event.key === 'Enter' && !showDeleteConfirm && !loading) handleSaveModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDeleteConfirm, loading]);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData?.street_number?.trim()) errors.street_number = 'Street Number is required';
    if (!formData?.street_name?.trim()) errors.street_name = 'Street Name is required';
    if (!formData?.suburb?.trim()) errors.suburb = 'Suburb is required';
    if (formData?.price && formData.price < 0) errors.price = 'Price cannot be negative';
    if (formData?.sold_price && formData.sold_price < 0) errors.sold_price = 'Sold Price cannot be negative';
    if (formData?.commission && formData.commission < 0) errors.commission = 'Commission cannot be negative';
    if (formData?.postcode && !/^\d{4}$/.test(formData.postcode)) errors.postcode = 'Postcode must be 4 digits';
    return errors;
  };

  const handleCloseModal = () => {
    setShowEditModal(false);
    setSelectedProperty(null);
    resetModalState();
    if (selectedProperty) {
      localStorage.removeItem(`property_draft_${selectedProperty.id}`);
    }
    resumeSubscription(); // Resume subscription when modal closes
    logDebug('Modal closed');
  };

  const handleSaveModal = async (closeAfterSave: boolean = true) => {
    logDebug(`handleSave triggered, closeAfterSave: ${closeAfterSave}`);
    if (!formData || !selectedProperty) {
      toast.error('No property data to save');
      logDebug('No formData or selectedProperty');
      return;
    }

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error('Please fix form errors before saving');
      logDebug(`Validation errors: ${JSON.stringify(errors, null, 2)}`);
      return;
    }

    setLoading(true);
    try {
      // Prepare update data
      const updateData: Partial<PropertyDetails> = {
        street_number: formData.street_number?.trim() || undefined,
        street_name: formData.street_name?.trim() || undefined,
        suburb: formData.suburb?.trim() || undefined,
        agent_name: formData.agent_name?.trim() || undefined,
        price: formData.price ?? undefined,
        sold_price: formData.sold_price ?? undefined,
        category: formData.category?.trim() || undefined,
        property_type: formData.property_type?.trim() || undefined,
        agency_name: formData.agency_name?.trim() || undefined,
        listed_date: formData.listed_date || undefined,
        sold_date: formData.sold_date || undefined,
        commission: formData.commission ?? undefined,
        sale_type: formData.sale_type?.trim() || undefined,
        postcode: formData.postcode?.trim() || undefined,
        bedrooms: formData.bedrooms ?? undefined,
        bathrooms: formData.bathrooms ?? undefined,
        car_garage: formData.car_garage ?? undefined,
        sqm: formData.sqm ?? undefined,
        landsize: formData.landsize ?? undefined,
        flood_risk: formData.flood_risk?.trim() || undefined,
        bushfire_risk: formData.bushfire_risk?.trim() || undefined,
        contract_status: formData.contract_status?.trim() || undefined,
        features: formData.features || [],
        same_street_sales: formData.same_street_sales || [],
        past_records: formData.past_records || [],
      };

      logDebug(`Update data prepared: ${JSON.stringify(updateData, null, 2)}`);

      // Detect changes
      const originalData = {
        street_number: selectedProperty.street_number || undefined,
        street_name: selectedProperty.street_name || undefined,
        suburb: selectedProperty.suburb || undefined,
        agent_name: selectedProperty.agent_name || undefined,
        price: selectedProperty.price ?? undefined,
        sold_price: selectedProperty.sold_price || undefined,
        category: selectedProperty.category || undefined,
        property_type: selectedProperty.property_type || undefined,
        agency_name: selectedProperty.agency_name || undefined,
        listed_date: selectedProperty.listed_date || undefined,
        sold_date: selectedProperty.sold_date || undefined,
        commission: selectedProperty.commission || undefined,
        sale_type: selectedProperty.sale_type || undefined,
        postcode: selectedProperty.postcode || undefined,
        bedrooms: selectedProperty.bedrooms ?? undefined,
        bathrooms: selectedProperty.bathrooms ?? undefined,
        car_garage: selectedProperty.car_garage || undefined,
        sqm: selectedProperty.sqm ?? undefined,
        landsize: selectedProperty.landsize ?? undefined,
        flood_risk: selectedProperty.flood_risk || undefined,
        bushfire_risk: selectedProperty.bushfire_risk || undefined,
        contract_status: selectedProperty.contract_status || undefined,
        features: selectedProperty.features || [],
        same_street_sales: selectedProperty.same_street_sales || [],
        past_records: selectedProperty.past_records || [],
      };
      const changes = deepDiff(originalData, updateData);
      logDebug(`Detected changes: ${JSON.stringify(changes, null, 2)}`);

      if (Object.keys(changes).length === 0) {
        toast.info('No changes detected');
        logDebug('No changes to save');
        if (closeAfterSave) {
          handleClose();
        }
        setLoading(false);
        return;
      }

      // Optimistic update
      setPendingUpdate(updateData);
      originalStateRef.current = {
        properties: properties.map((p) => ({ ...p })),
        filteredProperties: filteredProperties.map((p) => ({ ...p })),
      };
      const optimisticProperty = { ...selectedProperty, ...updateData };
      const optimisticProperties = properties.map((p) =>
        p.id === selectedProperty.id ? { ...optimisticProperty } : { ...p }
      );
      const optimisticFilteredProperties = filteredProperties.map((p) =>
        p.id === selectedProperty.id ? { ...optimisticProperty } : { ...p }
      );
      setProperties(optimisticProperties);
      setFilteredProperties(optimisticFilteredProperties);
      setFormData({ ...updateData });
      setSelectedProperty({ ...optimisticProperty });
      logDebug('Applied optimistic update to properties and filteredProperties');

      // Update Supabase
      const { data, error } = await supabase
        .from('properties')
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq('id', selectedProperty.id)
        .select()
        .single();

      if (error) {
        // Revert optimistic update
        if (originalStateRef.current) {
          setProperties(originalStateRef.current.properties);
          setFilteredProperties(originalStateRef.current.filteredProperties);
          setFormData({ ...selectedProperty });
          setSelectedProperty({ ...selectedProperty });
          logDebug('Reverted optimistic update due to error');
        }
        logDebug(`Supabase error: ${error.message}`);
        throw new Error(`Supabase update failed: ${error.message}`);
      }

      if (!data || data.id !== selectedProperty.id) {
        logDebug('Supabase returned invalid data');
        throw new Error('Invalid response from server');
      }

      logDebug(`Supabase response: ${JSON.stringify(data, null, 2)}`);

      // Confirm update
      const updatedProperty = { ...selectedProperty, ...data };
      const finalProperties = properties.map((p) =>
        p.id === selectedProperty.id ? { ...updatedProperty } : { ...p }
      );
      const finalFilteredProperties = filteredProperties.map((p) =>
        p.id === selectedProperty.id ? { ...updatedProperty } : { ...p }
      );

      setProperties(finalProperties);
      setFilteredProperties(finalFilteredProperties);
      setFormData({ ...data });
      setSelectedProperty({ ...updatedProperty });
      setSavedChanges(changes);
      setShowChanges(Object.keys(changes).length > 0);
      setAutoSaveDraft({ ...data });
      setPendingUpdate(null);
      debouncedGenerateMetrics();

      logDebug(`Final state updated: ${JSON.stringify(updatedProperty, null, 2)}`);

      toast.success('Property updated successfully');

      // Scroll to the updated property
      if (propertiesTableRef.current) {
        const element = propertiesTableRef.current.querySelector(
          `#property-${selectedProperty.id}`
        );
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      if (closeAfterSave) {
        handleClose();
      } else {
        resetModalState();
        setFormData({ ...data });
        setAutoSaveDraft({ ...data });
        logDebug('Modal kept open, formData reinitialized');
      }
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error(`Failed to save property: ${err.message}`);
      logDebug(`Save error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProperty) {
      toast.error('No property selected for deletion');
      logDebug('No selectedProperty for deletion');
      return;
    }

    setLoading(true);
    logDebug(`Initiating delete for property ID: ${selectedProperty.id}`);

    try {
      // Store original state for rollback
      originalStateRef.current = {
        properties: properties.map((p) => ({ ...p })),
        filteredProperties: filteredProperties.map((p) => ({ ...p })),
      };
      logDebug('Stored original state for rollback');

      // Optimistic UI update
      const optimisticProperties = properties.filter((p) => p.id !== selectedProperty.id);
      const optimisticFilteredProperties = filteredProperties.filter(
        (p) => p.id !== selectedProperty.id
      );
      setProperties(optimisticProperties);
      setFilteredProperties(optimisticFilteredProperties);
      logDebug('Applied optimistic delete to properties and filteredProperties');

      // Delete from Supabase
      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', selectedProperty.id);

      if (error) {
        // Revert optimistic update
        if (originalStateRef.current) {
          setProperties(originalStateRef.current.properties);
          setFilteredProperties(originalStateRef.current.filteredProperties);
          logDebug('Reverted optimistic delete due to error');
        }
        logDebug(`Supabase delete error: ${error.message}`);
        throw new Error(`Supabase delete failed: ${error.message}`);
      }

      // Clean up local storage
      localStorage.removeItem(`property_draft_${selectedProperty.id}`);
      logDebug(`Removed draft from localStorage for property ID: ${selectedProperty.id}`);

      debouncedGenerateMetrics();
      toast.success('Property deleted successfully');
      logDebug('Property deleted successfully from Supabase');
      handleClose();
    } catch (err: any) {
      console.error('Delete error:', err);
      toast.error(`Failed to delete property: ${err.message}`);
      logDebug(`Delete error: ${err.message}`);
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) =>
      prev
        ? {
            ...prev,
            [name]:
              name === 'price' ||
              name === 'sold_price' ||
              name === 'commission' ||
              name === 'bedrooms' ||
              name === 'bathrooms' ||
              name === 'car_garage' ||
              name === 'sqm' ||
              name === 'landsize'
                ? value === '' ? undefined : Number(value)
                : value,
          }
        : prev
    );
    setFormErrors((prev) => ({ ...prev, [name]: '' }));
    logDebug(`Input changed: ${name} = ${value}`);
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const getSuggestions = (field: keyof PropertyDetails): (string | number)[] => {
    const excludedFields = ['features', 'same_street_sales', 'past_records'];
    if (excludedFields.includes(field)) {
      return [];
    }
    const suggestions = new Set<string | number>();
    properties.forEach((p) => {
      const value = p[field];
      if (typeof value === 'string' || typeof value === 'number') {
        suggestions.add(value);
      }
    });
    return Array.from(suggestions).slice(0, 5);
  };

  return (
    <AnimatePresence>
      {showEditModal && selectedProperty && formData && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            ref={modalRef}
            className="bg-gradient-to-br from-white to-gray-50 p-8 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto relative"
            initial={{ scale: 0.9, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 50 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Debug Overlay */}
            <AnimatePresence>
              {showDebug && (
                <motion.div
                  className="absolute inset-0 bg-black bg-opacity-90 p-6 rounded-2xl overflow-y-auto text-white"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex justify-between mb-4">
                    <h3 className="text-lg font-bold">Debug Panel</h3>
                    <button onClick={() => setShowDebug(false)} className="text-white hover:text-gray-300">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="space-y-4 text-sm font-mono">
                    <div>
                      <strong>Form Data:</strong>
                      <pre className="bg-gray-800 p-2 rounded">{JSON.stringify(formData, null, 2)}</pre>
                    </div>
                    <div>
                      <strong>Selected Property:</strong>
                      <pre className="bg-gray-800 p-2 rounded">{JSON.stringify(selectedProperty, null, 2)}</pre>
                    </div>
                    <div>
                      <strong>Pending Update:</strong>
                      <pre className="bg-gray-800 p-2 rounded">{JSON.stringify(pendingUpdate, null, 2)}</pre>
                    </div>
                    <div>
                      <strong>Changes:</strong>
                      <pre className="bg-gray-800 p-2 rounded">{JSON.stringify(savedChanges, null, 2)}</pre>
                    </div>
                    <div>
                      <strong>Logs:</strong>
                      <ul className="list-disc pl-4">
                        {debugLogs.map((log, index) => (
                          <li key={index} className="text-gray-300">{log}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Delete Confirmation Dialog */}
            <AnimatePresence>
              {showDeleteConfirm && (
                <motion.div
                  className="absolute inset-0 bg-black bg-opacity-50 flex justify-center items-center rounded-2xl"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="bg-white p-6 rounded-xl shadow-lg"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.8 }}
                  >
                    <h3 className="text-lg font-bold mb-3">Confirm Deletion</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Are you sure you want to delete this property? This action cannot be undone.
                    </p>
                    <div className="flex justify-end space-x-3">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
                        disabled={loading}
                        aria-label="Cancel deletion"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDelete}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                        disabled={loading}
                        aria-label="Confirm deletion"
                      >
                        {loading ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">
                Edit Property: {selectedProperty.street_number} {selectedProperty.street_name}
              </h2>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowDebug(true)}
                  className="text-blue-600 hover:text-blue-800 transition"
                  aria-label="Toggle debug panel"
                  disabled={loading}
                >
                  <Bug className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-red-600 hover:text-red-800 transition"
                  aria-label="Delete property"
                  disabled={loading}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={handleClose}
                  className="text-gray-600 hover:text-gray-800 transition"
                  aria-label="Close modal"
                  disabled={loading}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Save Confirmation */}
            {showChanges && Object.keys(savedChanges).length > 0 && (
              <motion.div
                className="mb-6 p-4 bg-green-50 rounded-xl flex items-center"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                <p className="text-green-700 font-medium">Property saved successfully!</p>
                <button
                  onClick={() => setShowChanges(!showChanges)}
                  className="ml-2 text-blue-600 hover:underline font-medium"
                >
                  {showChanges ? 'Hide Changes' : 'View Changes'}
                </button>
              </motion.div>
            )}

            {/* Changes View */}
            {showChanges && Object.keys(savedChanges).length > 0 && (
              <motion.div
                className="mb-6 p-4 border border-gray-200 rounded-xl bg-gray-50"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Changes Made</h3>
                <ul className="space-y-2 text-sm">
                  {Object.entries(savedChanges).map(([key, { old, new: newValue }]) => (
                    <li key={key} className="flex items-center">
                      <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span>
                      <span className="ml-2 text-red-600">{old ?? 'N/A'}</span>
                      <span className="mx-2">→</span>
                      <span className="text-green-600">{newValue ?? 'N/A'}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            <div className="space-y-6">
              {/* Address Section */}
              <div className="border-b border-gray-200">
                <button
                  onClick={() => toggleSection('address')}
                  className="w-full flex justify-between items-center py-3 text-lg font-semibold text-gray-800"
                  aria-expanded={expandedSections.address}
                  aria-controls="address-section"
                >
                  <span>Address Details</span>
                  {expandedSections.address ? (
                    <ChevronUp className="w-5 h-5 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-600" />
                  )}
                </button>
                {expandedSections.address && (
                  <motion.div
                    id="address-section"
                    className="space-y-4 pt-4 pb-6"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    {[
                      { name: 'street_number', label: 'Street Number', type: 'text' },
                      { name: 'street_name', label: 'Street Name', type: 'text' },
                      { name: 'suburb', label: 'Suburb', type: 'text' },
                      { name: 'postcode', label: 'Postcode', type: 'text' },
                    ].map((field) => (
                      <div key={field.name}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {field.label}
                        </label>
                        <input
                          type={field.type}
                          name={field.name}
                          value={(formData[field.name as keyof PropertyDetails] as string | undefined) ?? ''}
                          onChange={handleInputChange}
                          className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${
                            formErrors[field.name] ? 'border-red-500' : ''
                          }`}
                          disabled={loading}
                          list={`${field.name}-suggestions`}
                          aria-invalid={!!formErrors[field.name]}
                          aria-describedby={formErrors[field.name] ? `${field.name}-error` : undefined}
                        />
                        <datalist id={`${field.name}-suggestions`}>
                          {getSuggestions(field.name as keyof PropertyDetails).map((suggestion, index) => (
                            <option key={index} value={String(suggestion)} />
                          ))}
                        </datalist>
                        {formErrors[field.name] && (
                          <p id={`${field.name}-error`} className="text-red-500 text-xs mt-1">
                            {formErrors[field.name]}
                          </p>
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>

              {/* Pricing Section */}
              <div className="border-b border-gray-200">
                <button
                  onClick={() => toggleSection('pricing')}
                  className="w-full flex justify-between items-center py-3 text-lg font-semibold text-gray-800"
                  aria-expanded={expandedSections.pricing}
                  aria-controls="pricing-section"
                >
                  <span>Pricing Information</span>
                  {expandedSections.pricing ? (
                    <ChevronUp className="w-5 h-5 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-600" />
                  )}
                </button>
                {expandedSections.pricing && (
                  <motion.div
                    id="pricing-section"
                    className="space-y-4 pt-4 pb-6"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    {[
                      { name: 'price', label: 'Price ($)', type: 'number', step: '0.01' },
                      { name: 'sold_price', label: 'Sold Price ($)', type: 'number', step: '0.01' },
                      { name: 'commission', label: 'Commission (%)', type: 'number', step: '0.01' },
                    ].map((field) => (
                      <div key={field.name}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {field.label}
                        </label>
                        <input
                          type={field.type}
                          name={field.name}
                          value={(formData[field.name as keyof PropertyDetails] as number | undefined) ?? ''}
                          onChange={handleInputChange}
                          className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${
                            formErrors[field.name] ? 'border-red-500' : ''
                          }`}
                          step={field.step}
                          disabled={loading}
                          aria-invalid={!!formErrors[field.name]}
                          aria-describedby={formErrors[field.name] ? `${field.name}-error` : undefined}
                        />
                        {formErrors[field.name] && (
                          <p id={`${field.name}-error`} className="text-red-500 text-xs mt-1">
                            {formErrors[field.name]}
                          </p>
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>

              {/* Details Section */}
              <div>
                <button
                  onClick={() => toggleSection('details')}
                  className="w-full flex justify-between items-center py-3 text-lg font-semibold text-gray-800"
                  aria-expanded={expandedSections.details}
                  aria-controls="details-section"
                >
                  <span>Property Details</span>
                  {expandedSections.details ? (
                    <ChevronUp className="w-5 h-5 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-600" />
                  )}
                </button>
                {expandedSections.details && (
                  <motion.div
                    id="details-section"
                    className="space-y-4 pt-4 pb-6"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    {[
                      { name: 'agent_name', label: 'Agent Name', type: 'text' },
                      { name: 'category', label: 'Category', type: 'select' },
                      { name: 'property_type', label: 'Property Type', type: 'text' },
                      { name: 'agency_name', label: 'Agency Name', type: 'text' },
                      { name: 'listed_date', label: 'Listed Date', type: 'date' },
                      { name: 'sold_date', label: 'Sale Date', type: 'date' },
                      { name: 'sale_type', label: 'Sale Type', type: 'text' },
                      { name: 'bedrooms', label: 'Bedrooms', type: 'number' },
                      { name: 'bathrooms', label: 'Bathrooms', type: 'number' },
                      { name: 'car_garage', label: 'Car Garage', type: 'number' },
                      { name: 'sqm', label: 'SQM', type: 'number' },
                      { name: 'landsize', label: 'Land Size', type: 'number' },
                      { name: 'flood_risk', label: 'Flood Risk', type: 'text' },
                      { name: 'bushfire_risk', label: 'Bushfire Risk', type: 'text' },
                      { name: 'contract_status', label: 'Contract Status', type: 'text' },
                    ].map((field) => (
                      <div key={field.name}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {field.label}
                        </label>
                        {field.type === 'select' ? (
                          <select
                            name={field.name}
                            value={(formData[field.name as keyof PropertyDetails] as string | undefined) || ''}
                            onChange={handleInputChange}
                            className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${
                              formErrors[field.name] ? 'border-red-500' : ''
                            }`}
                            disabled={loading}
                            aria-invalid={!!formErrors[field.name]}
                            aria-describedby={formErrors[field.name] ? `${field.name}-error` : undefined}
                          >
                            <option value="">Select Status</option>
                            {Array.from(new Set(properties.map(p => p.category).filter(Boolean))).map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type}
                            name={field.name}
                            value={
                              (formData[field.name as keyof PropertyDetails] as string | number | undefined) ?? ''
                            }
                            onChange={handleInputChange}
                            className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${
                              formErrors[field.name] ? 'border-red-500' : ''
                            }`}
                            disabled={loading}
                            list={`${field.name}-suggestions`}
                            aria-invalid={!!formErrors[field.name]}
                            aria-describedby={formErrors[field.name] ? `${field.name}-error` : undefined}
                          />
                        )}
                        <datalist id={`${field.name}-suggestions`}>
                          {getSuggestions(field.name as keyof PropertyDetails).map((suggestion, index) => (
                            <option key={index} value={String(suggestion)} />
                          ))}
                        </datalist>
                        {formErrors[field.name] && (
                          <p id={`${field.name}-error`} className="text-red-500 text-xs mt-1">
                            {formErrors[field.name]}
                          </p>
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>

            <div className="mt-8 flex justify-between items-center">
              <p className="text-sm text-gray-500">
                {autoSaveDraft ? 'Draft auto-saved' : 'Draft not saved'}
              </p>
              <div className="flex space-x-4">
                <motion.button
                  onClick={handleClose}
                  className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                  disabled={loading}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label="Cancel edit"
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={() => {
                    logDebug('Save and Continue clicked');
                    handleSave(false);
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-blue-400 disabled:cursor-not-allowed"
                  disabled={loading}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label="Save and continue editing"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Saving...
                    </span>
                  ) : (
                    'Save and Continue'
                  )}
                </motion.button>
                <motion.button
                  onClick={() => {
                    logDebug('Save and Close clicked');
                    handleSave(true);
                  }}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:bg-green-400 disabled:cursor-not-allowed"
                  disabled={loading}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label="Save and close"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 0 5.373 0 12 h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Saving...
                    </span>
                  ) : (
                    'Save and Close'
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}