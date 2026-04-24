import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Star } from 'lucide-react';
import { Product, formatRWF } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { getProductStockForBranch } from '@/lib/product-stock';
import { useI18n } from '@/lib/i18n';

interface Props {
  product: Product;
  variant?: 'grid' | 'list';
}

const ProductCard: React.FC<Props> = ({ product, variant = 'grid' }) => {
  const { addItem, branch } = useCart();
  const { t, translateCategory } = useI18n();
  const discountedPrice = product.discount > 0 ? product.price * (1 - product.discount / 100) : product.price;
  const maxQuantity = getProductStockForBranch(product, branch);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      product_id: product.id,
      product_name: product.name,
      price: discountedPrice,
      image: product.image,
      unit: product.unit,
      branch,
      max_quantity: maxQuantity,
    });
  };

  if (variant === 'list') {
    return (
      <Link to={`/product/${product.id}`} className="card-industrial flex gap-4 p-3">
        <div className="w-28 h-28 shrink-0 bg-secondary/50 border border-border overflow-hidden flex items-center justify-center">
          <img src={product.image} alt={product.name} className="w-full h-full object-contain" loading="lazy" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{translateCategory(product.category)}</div>
          <div className="text-sm font-medium line-clamp-2 mt-1">{product.name}</div>
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
            <Star className="h-3 w-3 fill-accent text-accent" />
            {product.rating} &bull; {product.brand}
          </div>
          <div className="mt-auto flex items-end justify-between pt-2">
            <div>
              {product.discount > 0 && (
                <div className="text-[10px] line-through text-muted-foreground">{formatRWF(product.price)}</div>
              )}
              <div className="text-primary font-semibold crt-glow">{formatRWF(discountedPrice)}</div>
            </div>
            <button onClick={handleAdd} className="terminal-btn text-[10px] py-1.5 px-2 flex items-center gap-1">
              <ShoppingCart className="h-3 w-3" /> {t('product.addShort')}
            </button>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/product/${product.id}`} className="card-industrial group flex flex-col relative">
      {product.discount > 0 && (
        <div className="absolute top-2 left-2 z-10 bg-accent text-accent-foreground text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wider">
          -{product.discount}%
        </div>
      )}
      {!product.in_stock && (
        <div className="absolute top-2 right-2 z-10 bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 uppercase">
          {t('assistant.outOfStock')}
        </div>
      )}
      <div className="aspect-square bg-secondary/30 border-b border-border overflow-hidden relative scanlines">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-contain p-2 transition-transform group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <div className="p-3 flex flex-col flex-1">
        <div className="text-[10px] uppercase text-muted-foreground tracking-wider truncate">
          {translateCategory(product.category)}
        </div>
        <h3 className="text-sm font-medium mt-1 line-clamp-2 min-h-[2.5rem]">
          {product.name}
        </h3>
        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
          <Star className="h-3 w-3 fill-accent text-accent" />
          <span>{product.rating}</span>
          <span className="mx-1">&bull;</span>
          <span className="truncate">{product.brand}</span>
        </div>
        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            {product.discount > 0 && (
              <div className="text-[10px] line-through text-muted-foreground">
                {formatRWF(product.price)}
              </div>
            )}
            <div className="text-primary font-semibold crt-glow text-sm truncate">
              {formatRWF(discountedPrice)}
            </div>
            <div className="text-[9px] text-muted-foreground uppercase">{t('product.perUnit', { values: { unit: product.unit } })}</div>
          </div>
          <button
            onClick={handleAdd}
            disabled={!product.in_stock || maxQuantity <= 0}
            className="shrink-0 border border-primary/50 bg-primary/10 p-2 hover:bg-primary hover:text-primary-foreground transition-all disabled:opacity-40"
            aria-label={t('product.addToCart')}
          >
            <ShoppingCart className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Link>
  );
};

export default ProductCard;
