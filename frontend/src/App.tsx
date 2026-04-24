import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import BlogRoutes from './blog-routes';
import StoreAssistant from './components/assistant/StoreAssistant';
import ScrollToTop from './components/ScrollToTop';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import ProtectedAdminRoute from './components/ProtectedAdminRoute';
import { I18nProvider } from './lib/i18n';
import Admin from './pages/Admin';
import Account from './pages/Account';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import Index from './pages/Index';
import Legal from './pages/Legal';
import Cart from './pages/Cart';
import PaymentCancel from './pages/PaymentCancel';
import PaymentSuccess from './pages/PaymentSuccess';
import ProductDetail from './pages/ProductDetail';
import Shop from './pages/Shop';
import Support from './pages/Support';
// MODULE_IMPORTS_START
// MODULE_IMPORTS_END

const queryClient = new QueryClient();

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Index />} />
    <Route path="/login" element={<Login />} />
    <Route path="/shop" element={<Shop />} />
    <Route path="/cart" element={<Cart />} />
    <Route path="/legal" element={<Legal />} />
    <Route path="/checkout" element={<Checkout />} />
    <Route path="/payment-cancel" element={<PaymentCancel />} />
    <Route path="/payment-success" element={<PaymentSuccess />} />
    <Route path="/account" element={<Account />} />
    <Route
      path="/admin/*"
      element={
        <ProtectedAdminRoute>
          <Admin />
        </ProtectedAdminRoute>
      }
    />
    <Route path="/product/:id" element={<ProductDetail />} />
    <Route path="/support" element={<Support />} />
    <Route path="/blog/*" element={<BlogRoutes />} />
    {/* MODULE_ROUTES_START */}
    {/* MODULE_ROUTES_END */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    {/* MODULE_PROVIDERS_START */}
    {/* MODULE_PROVIDERS_END */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <I18nProvider>
          <CartProvider>
            <TooltipProvider>
              <Toaster />
              <BrowserRouter
                future={{
                  v7_startTransition: true,
                  v7_relativeSplatPath: true,
                }}
              >
                <ScrollToTop />
                <AppRoutes />
                <StoreAssistant />
              </BrowserRouter>
            </TooltipProvider>
          </CartProvider>
        </I18nProvider>
      </AuthProvider>
    </ThemeProvider>
    {/* MODULE_PROVIDERS_CLOSE */}
  </QueryClientProvider>
);

export default App;
export { AppRoutes };
