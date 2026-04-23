import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Star, Minus, Plus, ChevronLeft, Shield, Truck, Package, Zap } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductCard from '@/components/products/ProductCard';
import { useProduct, useProducts } from '@/hooks/useProducts';
import { useCart } from '@/contexts/CartContext';
import { formatRWF } from '@/lib/types';
import { getProductStockForBranch } from '@/lib/product-stock';

const ProductDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { product, loading } = useProduct(id);
  const { products } = useProducts();
  const { addItem, branch } = useCart();
  const [qty, setQty] = useState(1);
  const discountedPrice = product ? (product.discount > 0 ? product.price * (1 - product.discount / 100) : product.price) : 0;
  const related = product ? products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4) : [];
  const maxQuantity = product ? getProductStockForBranch(product, branch) : 0;
  const safeQty = maxQuantity > 0 ? Math.min(Math.max(qty, 1), maxQuantity) : 0;

  useEffect(() => {
    if (!product) {
      return;
    }

    setQty((current) => (maxQuantity > 0 ? Math.min(Math.max(current, 1), maxQuantity) : 1));
  }, [maxQuantity, product]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="text-center py-20 text-muted-foreground">&gt; loading product...</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="text-center py-20">
          <div className="text-muted-foreground mb-4">&gt; product.not_found()</div>
          <Link to="/shop" className="terminal-btn text-xs">RETURN TO SHOP</Link>
        </div>
      </div>
    );
  }

  const handleAdd = () => {
    addItem({
      product_id: product.id,
      product_name: product.name,
      price: discountedPrice,
      image: product.image,
      unit: product.unit,
      branch,
      max_quantity: maxQuantity,
    }, safeQty);
  };

  const handleBuyNow = () => {
    handleAdd();
    setTimeout(() => {
      navigate('/checkout');
    }, 100);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
          <Link to="/" className="hover:text-primary">HOME</Link>
          <span>/</span>
          <Link to="/shop" className="hover:text-primary">SHOP</Link>
          <span>/</span>
          <Link to={`/shop?category=${encodeURIComponent(product.category)}`} className="hover:text-primary">
            {product.category}
          </Link>
          <span>/</span>
          <span className="text-primary truncate">{product.name}</span>
        </div>

        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-xs text-muted-foreground mb-4 hover:text-primary">
          <ChevronLeft className="h-3 w-3" /> BACK
        </button>

        {/* Main */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="industrial-border p-6 bg-card scanlines">
            <div className="aspect-square flex items-center justify-center bg-secondary/30 border border-border">
              <img src={product.image} alt={product.name} className="w-full h-full object-contain p-4" />
            </div>
            <div className="flex gap-2 mt-4">
              {product.discount > 0 && (
                <span className="tag text-accent border-accent/50 bg-accent/10">-{product.discount}% OFF</span>
              )}
              <span className={`tag ${product.in_stock ? 'border-primary/50 bg-primary/10' : 'border-destructive/50 bg-destructive/10 text-destructive'}`}>
                {product.in_stock ? 'IN STOCK' : 'OUT OF STOCK'}
              </span>
              <span className="tag">{product.brand}</span>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase text-muted-foreground mb-2">{product.category}</div>
            <h1 className="text-3xl md:text-4xl font-display text-primary crt-glow mb-3">
              {product.name}
            </h1>

            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${i < Math.floor(product.rating) ? 'fill-accent text-accent' : 'text-muted'}`}
                  />
                ))}
                <span className="ml-1">{product.rating}</span>
              </div>
              <span>SKU: {product.id}</span>
            </div>

            {/* Price */}
            <div className="border-y border-border py-4 my-4">
              <div className="flex items-baseline gap-3">
                <div className="text-4xl font-display text-primary crt-glow-strong">
                  {formatRWF(discountedPrice)}
                </div>
                {product.discount > 0 && (
                  <div className="text-lg line-through text-muted-foreground">
                    {formatRWF(product.price)}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground uppercase mt-1">
                per {product.unit} &bull; inclusive of all taxes
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              {product.description}
            </p>

            {/* Quantity */}
            <div className="flex items-center gap-4 mb-6">
              <div className="text-xs uppercase text-muted-foreground">QTY</div>
              <div className="flex items-center border border-border">
                <button
                  onClick={() => setQty(Math.max(1, Math.min(maxQuantity || 1, qty - 1)))}
                  disabled={maxQuantity <= 0}
                  className="p-2 hover:bg-secondary"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-12 text-center font-mono">{safeQty}</span>
                <button
                  onClick={() => setQty(Math.min(maxQuantity || 1, qty + 1))}
                  disabled={maxQuantity <= qty}
                  className="p-2 hover:bg-secondary"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                TOTAL: <span className="text-primary font-bold">{formatRWF(discountedPrice * safeQty)}</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {maxQuantity > 0 ? `${maxQuantity} available for your branch` : 'Out of stock for your branch'}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={handleAdd}
                disabled={!product.in_stock || maxQuantity <= 0}
                className="flex-1 terminal-btn flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <ShoppingCart className="h-4 w-4" /> ADD TO CART
              </button>
              <button
                onClick={handleBuyNow}
                disabled={!product.in_stock || maxQuantity <= 0}
                className="flex-1 border border-accent bg-accent text-accent-foreground px-4 py-2 uppercase tracking-wider text-sm hover:opacity-90 disabled:opacity-50"
              >
                BUY NOW
              </button>
            </div>

            {/* Perks */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { icon: Truck, label: 'FREE DELIVERY', sub: 'Over RWF 30K' },
                { icon: Shield, label: 'SECURE PAY', sub: 'SSL Encrypted' },
                { icon: Package, label: 'EASY RETURN', sub: '7-day policy' },
                { icon: Zap, label: 'FAST DISPATCH', sub: 'Same day' },
              ].map((p) => (
                <div key={p.label} className="flex items-center gap-2 border border-border p-2">
                  <p.icon className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <div className="font-bold text-[10px]">{p.label}</div>
                    <div className="text-[10px] text-muted-foreground">{p.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Spec */}
        <div className="industrial-border p-6 bg-card mb-12">
          <h3 className="text-xl font-display text-primary mb-4 border-b border-border pb-2">
            &gt; SPECIFICATIONS
          </h3>
            <div className="grid md:grid-cols-2 gap-x-8">
              <div className="data-row"><span className="label">PRODUCT ID</span><span className="value">{product.id}</span></div>
              <div className="data-row"><span className="label">CATEGORY</span><span className="value">{product.category}</span></div>
              <div className="data-row"><span className="label">BRAND</span><span className="value">{product.brand}</span></div>
              <div className="data-row"><span className="label">UNIT</span><span className="value">{product.unit}</span></div>
              <div className="data-row"><span className="label">RATING</span><span className="value">{product.rating} / 5.0</span></div>
              <div className="data-row"><span className="label">STOCK</span><span className="value">{maxQuantity} available</span></div>
            </div>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div>
            <h3 className="text-2xl font-display text-primary crt-glow mb-6 terminal-prompt">
              RELATED ITEMS
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {related.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default ProductDetail;
