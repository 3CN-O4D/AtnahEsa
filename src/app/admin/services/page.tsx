'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Wifi, Truck, FolderKanban, Phone, MessageCircle, Plus, Trash2, Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import type { WifiPackage, WifiCategory, Mover } from '@/types'

export default function AdminServicesPage() {
  const router = useRouter()
  type Tab = 'wifi' | 'movers' | 'categories' | 'bookings'
  type WifiBooking = { id: string; package_name: string; package_speed: string; package_price: number; name: string; phone: string; area: string; id_number: string; status: string; created_at: string }

  const [checking, setChecking] = useState(true)
  const [tab, setTab] = useState<Tab>('wifi')
  const [wifiPkgs, setWifiPkgs] = useState<WifiPackage[]>([])
  const [categories, setCategories] = useState<WifiCategory[]>([])
  const [pkgCats, setPkgCats] = useState<Record<string, string[]>>({})
  const [movers, setMovers] = useState<Mover[]>([])
  const [wifiBookings, setWifiBookings] = useState<WifiBooking[]>([])
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  // WiFi state
  const [editingWifi, setEditingWifi] = useState<WifiPackage | null>(null)
  const [wifiName, setWifiName] = useState('')
  const [wifiProvider, setWifiProvider] = useState('')
  const [wifiSpeed, setWifiSpeed] = useState('')
  const [wifiPrice, setWifiPrice] = useState('')
  const [wifiDesc, setWifiDesc] = useState('')
  const [wifiFeatures, setWifiFeatures] = useState('')
  const [wifiOriginalPrice, setWifiOriginalPrice] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  // Category state
  const [editingCat, setEditingCat] = useState<WifiCategory | null>(null)
  const [catName, setCatName] = useState('')
  const [catDesc, setCatDesc] = useState('')
  const [catColor, setCatColor] = useState('#2563EB')

  // Mover state
  const [editingMover, setEditingMover] = useState<Mover | null>(null)
  const [moverName, setMoverName] = useState('')
  const [moverDesc, setMoverDesc] = useState('')
  const [moverPrice, setMoverPrice] = useState('')
  const [moverLocation, setMoverLocation] = useState('')
  const [moverPhone, setMoverPhone] = useState('')
  const [moverImage, setMoverImage] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/signin'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (profile?.role !== 'admin') { router.push('/'); return }
      setChecking(false)
      loadData()
    })
  }, [])

  async function loadData() {
    const supabase = createClient()
    const [wRes, cRes, pcRes, mRes, bRes] = await Promise.all([
      supabase.from('wifi_packages').select('*').order('price'),
      supabase.from('wifi_categories').select('*').order('display_order'),
      supabase.from('wifi_package_categories').select('*'),
      supabase.from('movers').select('*').order('created_at', { ascending: false }),
      supabase.from('wifi_bookings').select('*').order('created_at', { ascending: false }),
    ])
    setWifiPkgs((wRes.data ?? []) as WifiPackage[])
    setCategories((cRes.data ?? []) as WifiCategory[])
    setMovers((mRes.data ?? []) as Mover[])
    setWifiBookings((bRes.data ?? []) as WifiBooking[])

    const grouped: Record<string, string[]> = {}
    for (const row of pcRes.data ?? []) {
      if (!grouped[row.package_id]) grouped[row.package_id] = []
      grouped[row.package_id].push(row.category_id)
    }
    setPkgCats(grouped)
  }

  const resetWifiForm = () => {
    setEditingWifi(null)
    setWifiName(''); setWifiProvider(''); setWifiSpeed(''); setWifiPrice('')
    setWifiDesc(''); setWifiFeatures(''); setWifiOriginalPrice(''); setSelectedCategories([])
  }

  const toggleCategory = (catId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    )
  }

  const handleSaveWifi = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    const pkgData = {
      name: wifiName,
      provider: wifiProvider,
      speed: wifiSpeed,
      price: parseInt(wifiPrice),
      description: wifiDesc,
      features: wifiFeatures.split('\n').filter(Boolean),
      original_price: parseInt(wifiOriginalPrice) || 0,
    }

    let pkgId: string | null = editingWifi?.id ?? null

    if (editingWifi) {
      const { error } = await supabase.from('wifi_packages').update(pkgData).eq('id', editingWifi.id)
      if (error) { showToast('error', error.message); return }
    } else {
      const { data, error } = await supabase.from('wifi_packages').insert(pkgData).select('id').single()
      if (error) { showToast('error', error.message); return }
      pkgId = data.id
    }

    // Update junction table: delete old, insert new
    if (pkgId) {
      await supabase.from('wifi_package_categories').delete().eq('package_id', pkgId)
      if (selectedCategories.length > 0) {
        const rows = selectedCategories.map((catId) => ({ package_id: pkgId!, category_id: catId }))
        const { error } = await supabase.from('wifi_package_categories').insert(rows)
        if (error) { showToast('error', error.message); return }
      }
    }

    showToast('success', editingWifi ? 'WiFi package updated' : 'WiFi package added')
    resetWifiForm()
    loadData()
  }

  const handleDeleteWifi = async (id: string) => {
    if (!confirm('Delete this WiFi package?')) return
    const supabase = createClient()
    const { error } = await supabase.from('wifi_packages').delete().eq('id', id)
    if (error) { showToast('error', error.message); return }
    showToast('success', 'WiFi package deleted')
    loadData()
  }

  const editWifi = (pkg: WifiPackage) => {
    setEditingWifi(pkg)
    setWifiName(pkg.name)
    setWifiProvider(pkg.provider)
    setWifiSpeed(pkg.speed)
    setWifiPrice(String(pkg.price))
    setWifiDesc(pkg.description)
    setWifiFeatures(pkg.features.join('\n'))
    setWifiOriginalPrice(String(pkg.original_price))
    setSelectedCategories(pkgCats[pkg.id] ?? [])
    setTab('wifi')
  }

  const catIdsForPkg = (pkgId: string) => pkgCats[pkgId] ?? []

  // Category handlers
  const resetCatForm = () => {
    setEditingCat(null); setCatName(''); setCatDesc(''); setCatColor('#2563EB')
  }

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    const data = { name: catName, description: catDesc, color: catColor }
    if (editingCat) {
      const { error } = await supabase.from('wifi_categories').update(data).eq('id', editingCat.id)
      if (error) { showToast('error', error.message); return }
      showToast('success', 'Category updated')
    } else {
      const { error } = await supabase.from('wifi_categories').insert(data)
      if (error) { showToast('error', error.message); return }
      showToast('success', 'Category created')
    }
    resetCatForm()
    loadData()
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category?')) return
    const supabase = createClient()
    const { error } = await supabase.from('wifi_categories').delete().eq('id', id)
    if (error) { showToast('error', error.message); return }
    showToast('success', 'Category deleted')
    loadData()
  }

  const editCategory = (cat: WifiCategory) => {
    setEditingCat(cat); setCatName(cat.name); setCatDesc(cat.description); setCatColor(cat.color); setTab('categories')
  }

  // Mover handlers
  const resetMoverForm = () => {
    setEditingMover(null); setMoverName(''); setMoverDesc(''); setMoverPrice(''); setMoverLocation(''); setMoverPhone(''); setMoverImage('')
  }

  const handleSaveMover = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    const data = { name: moverName, description: moverDesc, price: parseInt(moverPrice), location: moverLocation, phone: moverPhone, image: moverImage || null }
    if (editingMover) {
      const { error } = await supabase.from('movers').update(data).eq('id', editingMover.id)
      if (error) { showToast('error', error.message); return }
    } else {
      const { error } = await supabase.from('movers').insert(data)
      if (error) { showToast('error', error.message); return }
    }
    showToast('success', editingMover ? 'Mover updated' : 'Mover added')
    resetMoverForm()
    loadData()
  }

  const handleDeleteMover = async (id: string) => {
    if (!confirm('Delete this mover?')) return
    const supabase = createClient()
    const { error } = await supabase.from('movers').delete().eq('id', id)
    if (error) { showToast('error', error.message); return }
    showToast('success', 'Mover deleted')
    loadData()
  }

  const editMover = (m: Mover) => {
    setEditingMover(m); setMoverName(m.name); setMoverDesc(m.description); setMoverPrice(String(m.price)); setMoverLocation(m.location); setMoverPhone(m.phone); setMoverImage(m.image || ''); setTab('movers')
  }

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  if (checking) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
      <div className="flex items-center gap-2 mb-6">
        <Button variant={tab === 'wifi' ? 'primary' : 'outline'} size="sm" onClick={() => setTab('wifi')}>
          <Wifi className="w-4 h-4 mr-1" /> WiFi ({wifiPkgs.length})
        </Button>
        <Button variant={tab === 'categories' ? 'primary' : 'outline'} size="sm" onClick={() => setTab('categories')}>
          <FolderKanban className="w-4 h-4 mr-1" /> Categories ({categories.length})
        </Button>
        <Button variant={tab === 'movers' ? 'primary' : 'outline'} size="sm" onClick={() => setTab('movers')}>
          <Truck className="w-4 h-4 mr-1" /> Movers ({movers.length})
        </Button>
        <Button variant={tab === 'bookings' ? 'primary' : 'outline'} size="sm" onClick={() => setTab('bookings')}>
          <Phone className="w-4 h-4 mr-1" /> Bookings ({wifiBookings.length})
        </Button>
      </div>

      {tab === 'wifi' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">{editingWifi ? 'Edit WiFi Package' : 'Add WiFi Package'}</h2>
            <form onSubmit={handleSaveWifi} className="bg-white border rounded-xl p-4 space-y-3">
              <Input label="Name" id="wn" value={wifiName} onChange={(e) => setWifiName(e.target.value)} required />
              <Input label="Provider" id="wp" value={wifiProvider} onChange={(e) => setWifiProvider(e.target.value)} required />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Speed" id="ws" placeholder="e.g. 50 Mbps" value={wifiSpeed} onChange={(e) => setWifiSpeed(e.target.value)} required />
                <Input label="Sale Price (KSh)" id="wpr" type="number" value={wifiPrice} onChange={(e) => setWifiPrice(e.target.value)} required />
              </div>
              <Input label="Original Price (flash offer)" id="wop" type="number" value={wifiOriginalPrice} onChange={(e) => setWifiOriginalPrice(e.target.value)} placeholder="0 = no flash" />

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Categories (select all that apply)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {categories.map((c) => {
                    const checked = selectedCategories.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCategory(c.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                          checked
                            ? 'border-transparent text-white'
                            : 'border-gray-300 text-gray-700 hover:border-gray-400'
                        }`}
                        style={checked ? { backgroundColor: c.color } : {}}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center border ${
                          checked ? 'border-white bg-white/20' : 'border-gray-400'
                        }`}>
                          {checked && <Check className="w-3 h-3 text-white" />}
                        </div>
                        {c.name}
                      </button>
                    )
                  })}
                  {categories.length === 0 && (
                    <p className="text-xs text-gray-500 col-span-2">No categories yet. Create one in the Categories tab.</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <textarea value={wifiDesc} onChange={(e) => setWifiDesc(e.target.value)} rows={2} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Features (one per line)</label>
                <textarea value={wifiFeatures} onChange={(e) => setWifiFeatures(e.target.value)} rows={3} placeholder="Unlimited data&#10;Free installation&#10;24/7 support" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">{editingWifi ? 'Update' : 'Add'}</Button>
                {editingWifi && <Button type="button" variant="ghost" size="sm" onClick={resetWifiForm}>Cancel</Button>}
              </div>
            </form>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Existing Packages</h2>
            {wifiPkgs.length === 0 && <p className="text-gray-500 text-sm">No WiFi packages.</p>}
            {wifiPkgs.map((p) => {
              const catIds = catIdsForPkg(p.id)
              return (
                <div key={p.id} className="bg-white border rounded-xl p-3 flex items-start justify-between">
                  <div className="text-sm">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-gray-500">{p.provider} | {p.speed} | {formatPrice(p.price)}/mo</p>
                    {catIds.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {catIds.map((cid) => {
                          const cat = categoryMap[cid]
                          if (!cat) return null
                          return (
                            <span key={cid} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: cat.color + '20', color: cat.color }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                              {cat.name}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => editWifi(p)}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => handleDeleteWifi(p.id)}>Delete</Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">{editingCat ? 'Edit Category' : 'New Category'}</h2>
            <form onSubmit={handleSaveCategory} className="bg-white border rounded-xl p-4 space-y-3">
              <Input label="Name" id="cn" value={catName} onChange={(e) => setCatName(e.target.value)} required placeholder="e.g. Business Plans" />
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <textarea value={catDesc} onChange={(e) => setCatDesc(e.target.value)} rows={2} placeholder="Short description" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Theme Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={catColor} onChange={(e) => setCatColor(e.target.value)} className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer" />
                  <input type="text" value={catColor} onChange={(e) => setCatColor(e.target.value)} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="#2563EB" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">{editingCat ? 'Update' : 'Create'}</Button>
                {editingCat && <Button type="button" variant="ghost" size="sm" onClick={resetCatForm}>Cancel</Button>}
              </div>
            </form>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Categories</h2>
            {categories.length === 0 && <p className="text-gray-500 text-sm">No categories yet.</p>}
            {categories.map((c) => (
              <div key={c.id} className="bg-white border rounded-xl p-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: c.color }}>
                    {c.name.charAt(0)}
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-gray-500 text-xs">{c.description || 'No description'}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => editCategory(c)}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => handleDeleteCategory(c.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'bookings' && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">WiFi Bookings</h2>
          {wifiBookings.length === 0 && <p className="text-gray-500 text-sm">No bookings yet.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {wifiBookings.map((b) => (
              <div key={b.id} className="bg-white border rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{b.name}</p>
                    <p className="text-sm text-gray-500">{b.phone}</p>
                  </div>
                  <select value={b.status} onChange={async (e) => {
                    const supabase = createClient()
                    await supabase.from('wifi_bookings').update({ status: e.target.value }).eq('id', b.id)
                    loadData()
                  }} className="text-xs border rounded px-1 py-0.5">
                    <option value="pending">Pending</option>
                    <option value="contacted">Contacted</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <p className="text-sm"><strong>Package:</strong> {b.package_name} ({b.package_speed})</p>
                <p className="text-sm"><strong>Area:</strong> {b.area}</p>
                {b.id_number && <p className="text-sm"><strong>ID:</strong> {b.id_number}</p>}
                <p className="text-xs text-gray-400">{new Date(b.created_at).toLocaleString()}</p>
                <div className="flex gap-2 pt-1">
                  <a href={`tel:${b.phone}`} className="text-xs flex items-center gap-1 text-blue-600 hover:underline">
                    <Phone className="w-3 h-3" /> Call
                  </a>
                  <a href={`https://wa.me/254${b.phone.replace(/^0+/, '')}?text=Hi ${b.name}, regarding your ${b.package_name} booking.`} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1 text-green-600 hover:underline">
                    <MessageCircle className="w-3 h-3" /> WhatsApp
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'movers' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">{editingMover ? 'Edit Mover' : 'Add Mover'}</h2>
            <form onSubmit={handleSaveMover} className="bg-white border rounded-xl p-4 space-y-3">
              <Input label="Name" id="mn" value={moverName} onChange={(e) => setMoverName(e.target.value)} required />
              <Input label="Phone" id="mph" value={moverPhone} onChange={(e) => setMoverPhone(e.target.value)} required />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Price (KSh)" id="mpr" type="number" value={moverPrice} onChange={(e) => setMoverPrice(e.target.value)} required />
                <Input label="Location" id="ml" value={moverLocation} onChange={(e) => setMoverLocation(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <textarea value={moverDesc} onChange={(e) => setMoverDesc(e.target.value)} rows={2} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <Input label="Image URL (optional)" id="mi" value={moverImage} onChange={(e) => setMoverImage(e.target.value)} />
              <div className="flex gap-2">
                <Button type="submit" size="sm">{editingMover ? 'Update' : 'Add'}</Button>
                {editingMover && <Button type="button" variant="ghost" size="sm" onClick={resetMoverForm}>Cancel</Button>}
              </div>
            </form>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Existing Movers</h2>
            {movers.length === 0 && <p className="text-gray-500 text-sm">No movers.</p>}
            {movers.map((m) => (
              <div key={m.id} className="bg-white border rounded-xl p-3 flex items-start justify-between">
                <div className="text-sm">
                  <p className="font-medium">{m.name}</p>
                  <p className="text-gray-500">{m.location} | {formatPrice(m.price)} | {m.phone}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => editMover(m)}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => handleDeleteMover(m.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
