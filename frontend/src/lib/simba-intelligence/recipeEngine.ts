/**
 * SIMBA RECIPE ENGINE
 * Phase 4: Recipe intelligence & ingredient-to-product matching
 *
 * Capabilities:
 * - Identify recipes from user queries
 * - Generate ingredient lists
 * - Match ingredients to products
 * - Build shopping recommendations
 * - Calculate estimated costs
 */

import type { CartItem, Product } from '@/lib/types';
import { getProductStockForBranch } from '@/lib/product-stock';
import { scoreProduct } from './catalog';

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  ingredients: string[];
  instructions: string[];
  prepTime?: number; // minutes
  cookTime?: number; // minutes
  difficulty?: 'easy' | 'medium' | 'hard';
  cuisine?: string;
}

export interface RecipeMatch {
  recipe: Recipe;
  matchedIngredients: Array<{
    ingredient: string;
    products: Product[];
    primaryProduct?: Product;
  }>;
  missingIngredients: string[];
  totalCost: number;
  coverage: number; // 0-1: what percentage of ingredients found
}

export interface RecipeShoppingList {
  recipe: Recipe;
  items: CartItem[];
  totalCost: number;
  itemCount: number;
  missingIngredients: string[];
}

// ===== RECIPE LIBRARY =====

const RECIPE_LIBRARY: Record<string, Recipe> = {
  pizza: {
    id: 'pizza',
    name: 'Pizza Night',
    servings: 4,
    ingredients: ['flour', 'yeast', 'mozzarella cheese', 'tomato sauce', 'salt', 'olive oil'],
    instructions: [
      'Mix flour, yeast, salt, and water to form dough',
      'Let dough rest for 30 minutes',
      'Roll out dough and top with tomato sauce',
      'Add mozzarella cheese and preferred toppings',
      'Bake at 200°C for 15-20 minutes until crust is golden',
    ],
    prepTime: 20,
    cookTime: 20,
    difficulty: 'medium',
    cuisine: 'Italian',
  },
  chapati: {
    id: 'chapati',
    name: 'Chapati',
    servings: 4,
    ingredients: ['flour', 'salt', 'oil', 'water'],
    instructions: [
      'Mix flour, salt, oil, and water to form soft dough',
      'Rest dough for 20 minutes',
      'Divide into 8 portions and roll into thin circles',
      'Cook on hot pan for 1 minute each side until spots appear',
    ],
    prepTime: 25,
    cookTime: 15,
    difficulty: 'easy',
    cuisine: 'East African',
  },
  'fried rice': {
    id: 'fried-rice',
    name: 'Fried Rice',
    servings: 4,
    ingredients: ['rice', 'eggs', 'carrot', 'onion', 'peas', 'soy sauce', 'oil'],
    instructions: [
      'Cook rice and let it cool completely',
      'Heat oil in a wok or large pan',
      'Stir-fry onions, carrots, and peas for 2 minutes',
      'Add cooked rice and mix well',
      'Push rice to sides and scramble eggs in center',
      'Mix everything and add soy sauce to taste',
    ],
    prepTime: 10,
    cookTime: 10,
    difficulty: 'easy',
    cuisine: 'Asian',
  },
  breakfast: {
    id: 'breakfast',
    name: 'Family Breakfast',
    servings: 4,
    ingredients: ['milk', 'bread', 'eggs', 'tea', 'coffee', 'butter', 'jam', 'cereal'],
    instructions: [
      'Toast bread and spread with butter and jam',
      'Boil or fry eggs as preferred',
      'Brew tea and coffee in serving pot',
      'Serve with milk and cereal on the side',
    ],
    prepTime: 15,
    cookTime: 10,
    difficulty: 'easy',
    cuisine: 'International',
  },
  'rolex': {
    id: 'rolex',
    name: 'Rolex (Rolled Chapati)',
    servings: 2,
    ingredients: ['chapati', 'eggs', 'onion', 'tomato', 'salt', 'pepper', 'butter'],
    instructions: [
      'Cook chapati until soft',
      'Scramble eggs with onion and tomato',
      'Place egg filling in chapati center',
      'Roll tightly and slice if desired',
      'Serve hot',
    ],
    prepTime: 10,
    cookTime: 10,
    difficulty: 'easy',
    cuisine: 'East African',
  },
  'rice and beans': {
    id: 'rice-beans',
    name: 'Rice and Beans',
    servings: 5,
    ingredients: ['rice', 'beans', 'onion', 'tomato', 'oil', 'salt', 'spices'],
    instructions: [
      'Soak beans for 4 hours, then cook until soft',
      'Fry onions in oil until golden',
      'Add rice and stir for 2 minutes',
      'Add water (2:1 ratio), beans, and spices',
      'Cook on low heat for 15 minutes until rice is tender',
    ],
    prepTime: 20,
    cookTime: 30,
    difficulty: 'easy',
    cuisine: 'International',
  },
  'birthday party': {
    id: 'birthday-party',
    name: 'Birthday Party Spread',
    servings: 8,
    ingredients: ['juice', 'biscuits', 'snacks', 'soft drinks', 'water', 'plates', 'napkins', 'cake mix'],
    instructions: [
      'Arrange drinks in coolers with ice',
      'Set up snack platters',
      'Display biscuits and cakes',
      'Place serving items near drinks',
      'Keep backup supplies ready',
    ],
    prepTime: 30,
    cookTime: 0,
    difficulty: 'easy',
  },
  'healthy snacks': {
    id: 'healthy-snacks',
    name: 'Healthy Snack Platter',
    servings: 2,
    ingredients: ['nuts', 'fruit', 'yogurt', 'oats', 'wholegrain biscuits', 'water'],
    instructions: [
      'Arrange nuts in a bowl',
      'Slice fresh fruit',
      'Pour yogurt into serving cups',
      'Display wholegrain biscuits',
      'Serve with water',
    ],
    prepTime: 10,
    cookTime: 0,
    difficulty: 'easy',
  },
  'groceries': {
    id: 'groceries',
    name: 'Weekly Groceries',
    servings: 5,
    ingredients: ['rice', 'flour', 'oil', 'sugar', 'salt', 'milk', 'bread', 'eggs', 'soap', 'water'],
    instructions: [
      'Start with staple carbs (rice, flour, bread)',
      'Add proteins (eggs, milk)',
      'Include basic seasonings and oil',
      'Add household essentials',
      'Check for branch availability',
    ],
    prepTime: 0,
    cookTime: 0,
    difficulty: 'easy',
  },
};

// ===== UTILITY FUNCTIONS =====

function normalizeText(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String).map((item) => item.trim()).filter(Boolean);
      }
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

// ===== RECIPE IDENTIFICATION =====

/**
 * Identify recipe from user query
 */
export function identifyRecipe(query: string): Recipe | undefined {
  const normalized = normalizeText(query);

  if (normalized.includes('pizza')) return RECIPE_LIBRARY.pizza;
  if (normalized.includes('chapati')) return RECIPE_LIBRARY.chapati;
  if (normalized.includes('fried rice')) return RECIPE_LIBRARY['fried rice'];
  if (normalized.includes('breakfast')) return RECIPE_LIBRARY.breakfast;
  if (normalized.includes('rolex')) return RECIPE_LIBRARY.rolex;
  if (normalized.includes('rice and beans')) return RECIPE_LIBRARY['rice and beans'];
  if (normalized.includes('beans')) return RECIPE_LIBRARY['rice and beans'];
  if (normalized.includes('birthday') && normalized.includes('party')) return RECIPE_LIBRARY['birthday party'];
  if (normalized.includes('birthday')) return RECIPE_LIBRARY['birthday party'];
  if (normalized.includes('healthy snack')) return RECIPE_LIBRARY['healthy snacks'];
  if (normalized.includes('snack')) return RECIPE_LIBRARY['healthy snacks'];
  if (normalized.includes('grocer') || normalized.includes('weekly')) return RECIPE_LIBRARY.groceries;

  // Try partial match
  for (const [key, recipe] of Object.entries(RECIPE_LIBRARY)) {
    const recipeTokens = tokenize(recipe.name);
    const queryTokens = tokenize(query);
    const matches = queryTokens.filter((qt) => recipeTokens.some((rt) => rt.includes(qt) || qt.includes(rt)));
    if (matches.length >= 2) {
      return recipe;
    }
  }

  return undefined;
}

/**
 * Get all available recipes
 */
export function getAllRecipes(): Recipe[] {
  return Object.values(RECIPE_LIBRARY);
}

/**
 * Search recipes by keyword
 */
export function searchRecipes(query: string): Recipe[] {
  const normalized = normalizeText(query);
  const matches = Object.values(RECIPE_LIBRARY).filter((recipe) => {
    const recipeText = normalizeText(recipe.name + ' ' + recipe.cuisine + ' ' + recipe.ingredients.join(' '));
    return recipeText.includes(normalized) || tokenize(recipeText).some((token) => token.startsWith(normalized));
  });
  return matches;
}

// ===== INGREDIENT MATCHING =====

/**
 * Match ingredients to products
 * Returns best matching products for each ingredient
 */
export function matchIngredientsToProducts(
  ingredients: string[],
  products: Product[],
  branch?: string,
  limit: number = 3
): Array<{ ingredient: string; products: Product[]; primaryProduct?: Product }> {
  return ingredients.map((ingredient) => {
    const matches = products
      .filter((p) => {
        const stock = getProductStockForBranch(p, branch);
        if (stock <= 0) return false;

        const score = scoreProduct(ingredient, p, branch);
        return score >= 0.5; // Lower threshold for ingredient matching
      })
      .sort((a, b) => {
        const scoreA = scoreProduct(ingredient, a, branch);
        const scoreB = scoreProduct(ingredient, b, branch);
        return scoreB - scoreA;
      })
      .slice(0, limit);

    return {
      ingredient,
      products: matches,
      primaryProduct: matches[0],
    };
  });
}

/**
 * Find missing ingredients that couldn't be matched
 */
export function findMissingIngredients(
  matched: Array<{ ingredient: string; products: Product[] }>
): string[] {
  return matched.filter((item) => item.products.length === 0).map((item) => item.ingredient);
}

// ===== RECIPE MATCHING =====

/**
 * Match recipe to products and calculate cost
 */
export function matchRecipeToProducts(
  recipe: Recipe,
  products: Product[],
  branch?: string
): RecipeMatch {
  const matchedIngredients = matchIngredientsToProducts(recipe.ingredients, products, branch);
  const missingIngredients = findMissingIngredients(matchedIngredients);
  const coverage = (recipe.ingredients.length - missingIngredients.length) / recipe.ingredients.length;

  let totalCost = 0;
  for (const item of matchedIngredients) {
    if (item.primaryProduct) {
      totalCost += item.primaryProduct.price * (recipe.servings / 4); // Normalize to servings
    }
  }

  return {
    recipe,
    matchedIngredients,
    missingIngredients,
    totalCost,
    coverage,
  };
}

/**
 * Build shopping cart from recipe
 */
export function buildCartFromRecipe(recipe: Recipe, products: Product[], branch?: string): RecipeShoppingList {
  const matched = matchIngredientsToProducts(recipe.ingredients, products, branch, 1);
  const missing = findMissingIngredients(matched);

  const items: CartItem[] = matched
    .filter((item) => item.primaryProduct)
    .map((item) => ({
      product_id: item.primaryProduct!.id,
      product_name: item.primaryProduct!.name,
      price: item.primaryProduct!.price,
      image: item.primaryProduct!.image,
      quantity: 1,
      branch,
      unit: item.primaryProduct!.unit,
    }));

  const totalCost = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    recipe,
    items,
    totalCost,
    itemCount: items.length,
    missingIngredients: missing,
  };
}

/**
 * Suggest alternative recipes based on available products
 */
export function suggestAlternativeRecipes(
  availableProducts: Product[],
  excludeRecipe?: Recipe
): Array<{ recipe: Recipe; coverage: number }> {
  const suggestions = Object.values(RECIPE_LIBRARY)
    .filter((recipe) => !excludeRecipe || recipe.id !== excludeRecipe.id)
    .map((recipe) => {
      const matched = matchIngredientsToProducts(recipe.ingredients, availableProducts, undefined, 1);
      const missingCount = matched.filter((item) => item.products.length === 0).length;
      const coverage = (recipe.ingredients.length - missingCount) / recipe.ingredients.length;
      return { recipe, coverage };
    })
    .filter((item) => item.coverage >= 0.6) // Only suggest recipes with 60%+ ingredient availability
    .sort((a, b) => b.coverage - a.coverage);

  return suggestions;
}

/**
 * Calculate recipe cost variations by branch
 */
export function calculateRecipeCostByBranch(
  recipe: Recipe,
  products: Product[],
  branches: string[]
): Record<string, { totalCost: number; coverage: number }> {
  const costs: Record<string, { totalCost: number; coverage: number }> = {};

  for (const branch of branches) {
    const matched = matchRecipeToProducts(recipe, products, branch);
    costs[branch] = {
      totalCost: matched.totalCost,
      coverage: matched.coverage,
    };
  }

  return costs;
}

/**
 * Get servings adjustment factor
 */
export function adjustRecipeForServings(recipe: Recipe, targetServings: number): string[] {
  const factor = targetServings / recipe.servings;
  return recipe.ingredients.map((ingredient) => {
    // Try to extract quantity from ingredient string
    const parts = ingredient.split(' ');
    if (parts.length > 1 && !isNaN(Number(parts[0]))) {
      const quantity = Number(parts[0]) * factor;
      return `${quantity.toFixed(1)} ${parts.slice(1).join(' ')}`;
    }
    return ingredient;
  });
}

/**
 * Export recipe library for UI
 */
export function getRecipeLibrary() {
  return RECIPE_LIBRARY;
}
