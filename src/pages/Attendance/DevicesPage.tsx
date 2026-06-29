import React, { useState, useEffect } from 'react';
import { Search, RefreshCw, Plus, Fingerprint, X, Edit, Trash2 } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { getFirestore, collection, addDoc, getDocs, serverTimestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';

export const DevicesPage: React.FC = () => {
  const { currentUser } = useAuthContext();
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingDevice, setEditingDevice] = useState<any>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<any>(null);

  const filteredDevices = devices.filter((device) =>
    (device.location?.toLowerCase() ?? '').includes(searchQuery.toLowerCase()) ||
    (device.deviceId?.toLowerCase() ?? '').includes(searchQuery.toLowerCase())
  );

  const fetchDevices = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const db = getFirestore();
      const snapshot = await getDocs(collection(db, 'devices'));
      const data: any[] = [];
      snapshot.forEach((d) => data.push({ id: d.id, ...d.data() }));
      setDevices(data);
    } catch (e) {
      console.error('Error fetching devices:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterDevice = async () => {
    if (!currentUser || !deviceId.trim() || !location.trim()) return;
    setSaving(true);
    try {
      const db = getFirestore();
      if (editingDevice) {
        await updateDoc(doc(db, 'devices', editingDevice.id), {
          deviceId: deviceId.trim(),
          location: location.trim(),
        });
      } else {
        await addDoc(collection(db, 'devices'), {
          deviceId: deviceId.trim(),
          location: location.trim(),
          createdAt: serverTimestamp(),
        });
      }
      setDeviceId('');
      setLocation('');
      setModalOpen(false);
      setEditingDevice(null);
      fetchDevices();
    } catch (e) {
      console.error('Error saving device:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (device: any) => {
    setEditingDevice(device);
    setDeviceId(device.deviceId || '');
    setLocation(device.location || '');
    setModalOpen(true);
  };

  const handleDeleteClick = (device: any) => {
    setDeviceToDelete(device);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!currentUser || !deviceToDelete) return;
    try {
      const db = getFirestore();
      await deleteDoc(doc(db, 'devices', deviceToDelete.id));
      setDeleteModalOpen(false);
      setDeviceToDelete(null);
      fetchDevices();
    } catch (e) {
      console.error('Error deleting device:', e);
    }
  };

  const openAddModal = () => {
    setEditingDevice(null);
    setDeviceId('');
    setLocation('');
    setModalOpen(true);
  };

  useEffect(() => { fetchDevices(); }, [currentUser]);

  return (
    <div className="flex flex-col h-full bg-secondary-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-secondary-200">
        <div>
          <h1 className="text-xl font-semibold text-secondary-900">Devices</h1>
          <p className="text-sm text-secondary-500">
            Manage biometric devices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDevices}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-secondary-50 p-6">
        {/* Search Bar */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
            <input
              type="text"
              placeholder="Search devices by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Plus size={16} />
              Register Device
            </button>
          </div>
        </div>

        {/* Devices Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-secondary-300 border-t-purple-600 rounded-full animate-spin" />
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <Fingerprint className="w-10 h-10 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-secondary-900 mb-2">
              {searchQuery ? 'No devices found' : 'No devices yet'}
            </h3>
            <p className="text-sm text-secondary-500 max-w-sm">
              {searchQuery
                ? 'Try adjusting your search terms'
                : 'Device records will appear here once they are registered.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDevices.map((device) => (
              <div
                key={device.id}
                className="card p-5 hover:shadow-md transition-shadow relative"
              >
                <div className="absolute top-4 right-4 flex gap-1">
                  <button
                    onClick={() => handleEditClick(device)}
                    className="p-1.5 rounded-lg text-secondary-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(device)}
                    className="p-1.5 rounded-lg text-secondary-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex items-start mb-3">
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                    <Fingerprint className="w-6 h-6 text-red-600" />
                  </div>
                </div>
                <h3 className="font-semibold text-secondary-900 mb-1">
                  {device.location || 'Unknown'}
                </h3>
                <div className="space-y-1 text-sm text-secondary-600">
                  <p>
                    <span className="font-medium">ID:</span> {device.deviceId}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        {!loading && devices.length > 0 && (
          <div className="mt-6 text-sm text-secondary-500">
            Showing {filteredDevices.length} of {devices.length} devices
          </div>
        )}
      </div>

      {/* Register Device Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <h2 className="text-base font-semibold text-secondary-900">{editingDevice ? 'Edit Device' : 'Register Device'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Device ID</label>
                <input
                  type="text"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  placeholder="Enter device ID"
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Enter device location"
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRegisterDevice}
                  disabled={saving || !deviceId.trim() || !location.trim()}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-70"
                >
                  {saving ? 'Saving...' : 'Register'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && deviceToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeleteModalOpen(false)}>
          <div className="bg-white rounded-xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <h2 className="text-base font-semibold text-secondary-900">Delete Device</h2>
              <button onClick={() => setDeleteModalOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-secondary-700 mb-4">
                Are you sure you want to delete the device at <span className="font-medium">{deviceToDelete.location}</span>?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteModalOpen(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
