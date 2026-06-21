/**
 * services/calendar-service.js — MyMoney
 * All Financial Calendar API calls go through this module.
 */

import { post } from '../core/api.js';
import { Config } from '../core/config.js';

const A = Config.API.CALENDAR;

export const CalendarService = Object.freeze({

  /** POST /api/calendar/dashboard */
  async getDashboard() {
    return post(A.DASHBOARD);
  },

  /** POST /api/calendar/month — { year, month, eventTypeId? } */
  async getByMonth(year, month, eventTypeId = null) {
    return post(A.MONTH, { year, month, ...(eventTypeId ? { eventTypeId } : {}) });
  },

  /** POST /api/calendar/week — { weekStart: "yyyy-MM-dd" } */
  async getByWeek(weekStart) {
    return post(A.WEEK, { weekStart });
  },

  /** POST /api/calendar/day — { date: "yyyy-MM-dd" } */
  async getByDay(date) {
    return post(A.DAY, { date });
  },

  /** POST /api/calendar/agenda — { startDate?, daysAhead, pageNumber, pageSize } */
  async getAgenda(startDate = null, daysAhead = 30, pageNumber = 1, pageSize = 20) {
    return post(A.AGENDA, { ...(startDate ? { startDate } : {}), daysAhead, pageNumber, pageSize });
  },

  /** POST /api/calendar/search */
  async search(params) {
    return post(A.SEARCH, params);
  },

  /** POST /api/calendar/events/get — { eventId } */
  async getEvent(eventId) {
    return post(A.EVENT_GET, { eventId });
  },

  /** POST /api/calendar/events/create */
  async createEvent(data) {
    return post(A.EVENT_CREATE, data);
  },

  /** POST /api/calendar/events/update */
  async updateEvent(data) {
    return post(A.EVENT_UPDATE, data);
  },

  /** POST /api/calendar/events/delete — { eventId } */
  async deleteEvent(eventId) {
    return post(A.EVENT_DELETE, { eventId });
  },

  /** POST /api/calendar/events/complete — { eventId } */
  async completeEvent(eventId) {
    return post(A.EVENT_COMPLETE, { eventId });
  },

  /** POST /api/calendar/reminders/dismiss — { reminderId } */
  async dismissReminder(reminderId) {
    return post(A.REMINDER_DISMISS, { reminderId });
  },

});
