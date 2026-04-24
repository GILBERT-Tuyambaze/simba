import { useState } from 'react';
import { useEffect } from 'react';
import { Plus, Save } from 'lucide-react';
import { toast } from 'sonner';

import { createAdminProduct, updateAdminProduct } from '@/lib/admin';
import { BRANCHES, type Product } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { normalizeStoreRole } from '@/lib/store-roles';
import { useI18n } from '@/lib/i18n';

type Props = {
  actorRole: string;
  defaultBranch?: string | null;
  onCreated: () => void;
  editingProduct?: Product | null;
  onCancelEdit?: () => void;
};

function toJsonList(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return trimmed;
  }
  return JSON.stringify(
    trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function toJsonNumberList(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('[')) {
    return trimmed;
  }
  return JSON.stringify(
    trimmed
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item))
  );
}

function fromJsonList(value?: string | string[] | null): string {
  if (!value) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.join(', ');
    }
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed)
        .map(([key, nextValue]) => `${key}: ${String(nextValue)}`)
        .join(', ');
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function createBlankForm(defaultBranch?: string | null) {
  return {
    name: '',
    category: '',
    price: '0',
    stock_count: '0',
    branch: defaultBranch || BRANCHES[0],
    image: '',
    description: '',
    tags: '',
    attributes: '',
    variations: '',
    options: '',
    addons: '',
    modifiers: '',
    upsells: '',
    cross_sells: '',
    related_products: '',
    recommended_products: '',
    similar_products: '',
    frequently_bought_together: '',
    available_for_delivery: true,
    best_seller: false,
    new_arrival: false,
    featured: false,
    on_sale: false,
    out_of_stock: false,
    low_stock: false,
    backorder: false,
    pre_order: false,
    discontinued: false,
  };
}

function createFormFromProduct(product: Product, defaultBranch?: string | null) {
  const branch = product.branch || defaultBranch || BRANCHES[0];
  return {
    name: product.name || '',
    category: product.category || '',
    price: String(product.price ?? 0),
    stock_count: String(product.stock_count ?? 0),
    branch,
    image: product.image || '',
    description: product.description || '',
    tags: fromJsonList(product.tags),
    attributes: fromJsonList(product.attributes),
    variations: fromJsonList(product.variations),
    options: fromJsonList(product.options),
    addons: fromJsonList(product.addons),
    modifiers: fromJsonList(product.modifiers),
    upsells: fromJsonList(product.upsells),
    cross_sells: fromJsonList(product.cross_sells),
    related_products: fromJsonList(product.related_products),
    recommended_products: fromJsonList(product.recommended_products),
    similar_products: fromJsonList(product.similar_products),
    frequently_bought_together: fromJsonList(product.frequently_bought_together),
    available_for_delivery: product.available_for_delivery ?? true,
    best_seller: Boolean(product.best_seller),
    new_arrival: Boolean(product.new_arrival),
    featured: Boolean(product.featured),
    on_sale: Boolean(product.on_sale),
    out_of_stock: Boolean(product.out_of_stock),
    low_stock: Boolean(product.low_stock),
    backorder: Boolean(product.backorder),
    pre_order: Boolean(product.pre_order),
    discontinued: Boolean(product.discontinued),
  };
}

export default function ProductCreatePanel({
  actorRole,
  defaultBranch,
  onCreated,
  editingProduct,
  onCancelEdit,
}: Props) {
  const { t } = useI18n();
  const normalizedRole = normalizeStoreRole(actorRole);
  const branchLocked = normalizedRole !== 'super_admin';

  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() =>
    editingProduct
      ? createFormFromProduct(editingProduct, defaultBranch)
      : createBlankForm(defaultBranch)
  );

  useEffect(() => {
    setForm(
      editingProduct
        ? createFormFromProduct(editingProduct, defaultBranch)
        : createBlankForm(defaultBranch)
    );
  }, [defaultBranch, editingProduct]);

  const updateField = (field: string, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.category.trim()) {
      toast.error(t('admin.productNameCategoryRequired'));
      return;
    }

    const stockCount = Math.max(Number(form.stock_count) || 0, 0);
    const branch = branchLocked ? defaultBranch || form.branch : form.branch;

    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim(),
        price: Number(form.price) || 0,
        stock_count: stockCount,
        in_stock: stockCount > 0 && !form.out_of_stock,
        branch,
        image: form.image.trim() || undefined,
        description: form.description.trim() || undefined,
        available_for_delivery: form.available_for_delivery,
        branch_stock: JSON.stringify({ [branch]: stockCount }),
        tags: toJsonList(form.tags) || undefined,
        attributes: toJsonList(form.attributes) || undefined,
        variations: toJsonList(form.variations) || undefined,
        options: toJsonList(form.options) || undefined,
        addons: toJsonList(form.addons) || undefined,
        modifiers: toJsonList(form.modifiers) || undefined,
        upsells: toJsonNumberList(form.upsells) || undefined,
        cross_sells: toJsonNumberList(form.cross_sells) || undefined,
        related_products: toJsonNumberList(form.related_products) || undefined,
        recommended_products: toJsonNumberList(form.recommended_products) || undefined,
        similar_products: toJsonNumberList(form.similar_products) || undefined,
        frequently_bought_together: toJsonNumberList(form.frequently_bought_together) || undefined,
        best_seller: form.best_seller,
        new_arrival: form.new_arrival,
        featured: form.featured,
        on_sale: form.on_sale,
        out_of_stock: form.out_of_stock,
        low_stock: form.low_stock,
        backorder: form.backorder,
        pre_order: form.pre_order,
        discontinued: form.discontinued,
      };

      if (editingProduct) {
        await updateAdminProduct(editingProduct.id, payload);
        toast.success(t('admin.productUpdated'));
      } else {
        await createAdminProduct(payload);
        toast.success(t('admin.productCreated'));
      }

      setForm(createBlankForm(defaultBranch));
      onCreated();
      if (editingProduct && onCancelEdit) {
        onCancelEdit();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('admin.productSaveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 border border-border bg-secondary/20 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-display text-primary">
        <Plus className="h-4 w-4" />
        {editingProduct
          ? t('admin.editProductTitle', { values: { id: editingProduct.id } })
          : t('admin.addProductFlow')}
      </div>
      {editingProduct && onCancelEdit && (
        <div className="mb-3 flex items-center justify-between gap-3 border border-dashed border-border bg-background/50 p-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span>{t('admin.editingExistingProduct')}</span>
          <Button type="button" variant="outline" onClick={onCancelEdit}>
            {t('admin.cancelEdit')}
          </Button>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product_name">{t('admin.productName')}</Label>
              <Input id="product_name" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product_category">{t('admin.productCategory')}</Label>
              <Input id="product_category" value={form.category} onChange={(event) => updateField('category', event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product_price">{t('admin.productPrice')}</Label>
              <Input id="product_price" type="number" value={form.price} onChange={(event) => updateField('price', event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product_stock">{t('admin.productStock')}</Label>
              <Input id="product_stock" type="number" value={form.stock_count} onChange={(event) => updateField('stock_count', event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product_branch">{t('admin.branch')}</Label>
              <select
                id="product_branch"
                value={branchLocked ? defaultBranch || form.branch : form.branch}
                onChange={(event) => updateField('branch', event.target.value)}
                disabled={branchLocked}
                className="w-full border border-border bg-input p-2 font-mono text-sm"
              >
                {BRANCHES.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product_image">{t('admin.productImageUrl')}</Label>
              <Input id="product_image" value={form.image} onChange={(event) => updateField('image', event.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product_description">{t('admin.productDescription')}</Label>
            <Textarea id="product_description" rows={4} value={form.description} onChange={(event) => updateField('description', event.target.value)} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product_tags">{t('admin.productTags')}</Label>
              <Input id="product_tags" value={form.tags} onChange={(event) => updateField('tags', event.target.value)} placeholder={t('admin.productTagsPlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product_options">{t('admin.productOptions')}</Label>
              <Input id="product_options" value={form.options} onChange={(event) => updateField('options', event.target.value)} placeholder={t('admin.productOptionsPlaceholder')} />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ['attributes', t('admin.attributesJson')],
              ['variations', t('admin.variationsJson')],
              ['addons', t('admin.addons')],
              ['modifiers', t('admin.modifiers')],
              ['upsells', t('admin.upsellIds')],
              ['cross_sells', t('admin.crossSellIds')],
              ['related_products', t('admin.relatedIds')],
              ['recommended_products', t('admin.recommendedIds')],
              ['similar_products', t('admin.similarIds')],
              ['frequently_bought_together', t('admin.frequentlyBoughtIds')],
            ].map(([field, label]) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={field}>{label}</Label>
                <Textarea
                  id={field}
                  rows={2}
                  value={String(form[field as keyof typeof form] || '')}
                  onChange={(event) => updateField(field, event.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ['available_for_delivery', t('admin.availableForDelivery')],
              ['best_seller', t('admin.bestSeller')],
              ['new_arrival', t('admin.newArrival')],
              ['featured', t('admin.featured')],
              ['on_sale', t('admin.onSale')],
              ['out_of_stock', t('admin.outOfStock')],
              ['low_stock', t('admin.lowStock')],
              ['backorder', t('admin.backorder')],
              ['pre_order', t('admin.preOrder')],
              ['discontinued', t('admin.discontinued')],
            ].map(([field, label]) => (
              <label key={field} className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={Boolean(form[field as keyof typeof form])}
                  onChange={(event) => updateField(field, event.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>

          <Button type="button" className="w-full gap-2" onClick={() => void handleSubmit()} disabled={busy}>
            <Save className="h-4 w-4" />
            {busy
              ? editingProduct
                ? t('admin.updatingProduct')
                : t('admin.creatingProduct')
              : editingProduct
                ? t('admin.updateProduct')
                : t('admin.createProduct')}
          </Button>
        </div>
      </div>
    </div>
  );
}
