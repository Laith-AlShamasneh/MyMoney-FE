/**
 * services/category-service.js — MyMoney
 * All category API calls go through this module (ADR-004).
 */

import { post } from '../core/api.js';
import { Config } from '../core/config.js';

const A = Config.API.CATEGORY;

export const CategoryService = Object.freeze({

  /** POST /api/categories/get/list */
  async getList(typeId) {
    return post(A.LIST, { typeId: typeId ?? null });
  },

});
