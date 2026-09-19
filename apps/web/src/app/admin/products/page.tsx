"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api-client";
import type { Category, Product } from "@/lib/types";

// FR-001-005.
export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    categoryId: "",
    unit: "Piece",
    officialPrice: "",
    minStockLevel: "0",
  });

  function loadProducts(q?: string) {
    apiRequest<Product[]>("/products", { query: { search: q } }).then(setProducts);
  }

  useEffect(() => {
    loadProducts();
    apiRequest<Category[]>("/categories").then((cats) => {
      setCategories(cats);
      setForm((f) => ({ ...f, categoryId: f.categoryId || cats[0]?.id || "" }));
    });
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => loadProducts(search), 250);
    return () => clearTimeout(handle);
  }, [search]);

  async function addCategory() {
    if (!newCategoryName.trim()) return;
    const cat = await apiRequest<Category>("/categories", { method: "POST", body: { name: newCategoryName } });
    setCategories((prev) => [...prev, cat]);
    setForm((f) => ({ ...f, categoryId: cat.id }));
    setNewCategoryName("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest("/products", {
        method: "POST",
        body: {
          name: form.name,
          sku: form.sku,
          barcode: form.barcode || undefined,
          categoryId: form.categoryId,
          unit: form.unit,
          officialPrice: Number(form.officialPrice),
          minStockLevel: Number(form.minStockLevel),
        },
      });
      setForm({ name: "", sku: "", barcode: "", categoryId: form.categoryId, unit: "Piece", officialPrice: "", minStockLevel: "0" });
      setShowForm(false);
      loadProducts(search);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save product.");
    }
  }

  async function disableProduct(id: string) {
    if (!confirm("Disable this product? It will be hidden from POS search but kept for history.")) return;
    await apiRequest(`/products/${id}/disable`, { method: "PATCH" });
    loadProducts(search);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Products</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          {showForm ? "Cancel" : "+ Add Product"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4 md:grid-cols-3">
          <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
          <input required placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
          <input placeholder="Barcode (optional)" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />

          <div className="flex gap-1">
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="flex-1 rounded-md border border-neutral-300 px-3 py-2">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-1">
            <input placeholder="New category…" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            <button type="button" onClick={addCategory} className="rounded-md border border-neutral-300 px-3 text-sm">Add</button>
          </div>

          <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2">
            {["Piece", "Box", "Set", "Other"].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input required type="number" min={0} placeholder="Official price" value={form.officialPrice} onChange={(e) => setForm({ ...form, officialPrice: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
          <input type="number" min={0} placeholder="Min stock level" value={form.minStockLevel} onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />

          {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
          <button type="submit" className="col-span-full rounded-md bg-neutral-900 px-4 py-2 font-medium text-white">Save Product</button>
        </form>
      )}

      <input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3 w-full max-w-sm rounded-md border border-neutral-300 px-3 py-2" />

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Unit</th>
              <th className="px-4 py-2">Official Price</th>
              <th className="px-4 py-2">Min Stock</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2">
                  <a href={`/admin/products/${p.id}`} className="hover:underline">{p.name}</a>
                </td>
                <td className="px-4 py-2">{p.sku}</td>
                <td className="px-4 py-2">{p.unit}</td>
                <td className="px-4 py-2">Rs. {p.officialPrice}</td>
                <td className="px-4 py-2">{p.minStockLevel}</td>
                <td className="px-4 py-2">{p.status}</td>
                <td className="px-4 py-2">
                  {p.status === "ACTIVE" && (
                    <button onClick={() => disableProduct(p.id)} className="text-neutral-500 hover:text-red-600">Disable</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
