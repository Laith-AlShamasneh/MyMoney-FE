/**
 * services/category-service.js — MyMoney
 * All category API calls go through this module (ADR-004).
 */

import { get } from '../core/api.js';
import { Config } from '../core/config.js';

const A = Config.API.CATEGORY;

export const CategoryService = Object.freeze({

  /** GET /api/categories/get/list?typeId=1|2 */
  async getList(typeId) {
    const qs = typeId != null ? `?typeId=${typeId}` : '';
    return get(`${A.LIST}${qs}`);
  },

});
