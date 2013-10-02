define(function(require){
	var $ = require('jquery'),
		_ = require('underscore'),
		monster = require('monster');

	var app = {
		requests: {
			'voip.callLogs.listCdrs': {
				url: 'accounts/{accountId}/cdrs?created_from={fromDate}&created_to={toDate}',
				verb: 'GET'
			},
			'voip.callLogs.getCdr': {
				url: 'accounts/{accountId}/cdrs/{cdrId}',
				verb: 'GET'
			}
		},

		subscribe: {
			'voip.callLogs.render': 'callLogsRender'
		},

		callLogsRender: function(parent) {
			var self = this;

			self.callLogsRenderContent(parent);
		},

		callLogsRenderContent: function(parent, fromDate, toDate) {
			var self = this,
				dataTemplate = {},
				template;

			if(!toDate) {
				toDate = new Date();
				if(fromDate) {
					toDate.setTime(fromDate.getTime());
					toDate.setDate(+7);
				}
			}
			if(!fromDate) {
				fromDate = new Date();
				fromDate.setDate(-7);
			}

			self.callLogsGetCdrs(fromDate, toDate, function(cdrs) {
				console.log(cdrs);
				cdrs = self.callLogsFormatCdrs(cdrs);

				dataTemplate.cdrs = cdrs;
				template = $(monster.template(self, 'callLogs-layout', dataTemplate));

				self.callLogsBindEvents(template, cdrs);

				parent
					.empty()
					.append(template);

				self.callLogsInitDatepickers(template, fromDate, toDate);
			});
		},

		callLogsBindEvents: function(template, cdrs) {
			var self = this;

			template.find('.filter-div i.apply-filter').on('click', function(e) {
				var fromDate = template.find('.filter-div input.filter-from').datepicker("getDate"),
					toDate = template.find('.filter-div input.filter-to').datepicker("getDate")
				self.callLogsRenderContent(template.parents('.right-content'), fromDate, toDate);
			});

			template.find('.filter-div i.refresh-filter').on('click', function(e) {
				self.callLogsRenderContent(template.parents('.right-content'));
			});

			template.find('.search-div input.search-query').on('keyup', function(e) {
				var searchValue = $(this).val().replace(/\|/g,'').toLowerCase(),
					matchedResults = false;
				if(searchValue.length <= 0) {
					template.find('.grid-row-group').show();
					matchedResults = true;
				} else {
					_.each(cdrs, function(cdr) {
						var searchString = (cdr.date + "|" + cdr.fromName + "|" 
										 + cdr.fromNumber + "|" + cdr.toName + "|" 
										 + cdr.toNumber + "|" + cdr.hangupCause).toLowerCase(),
							rowGroup = template.find('.grid-row.a-leg[data-id="'+cdr.id+'"]').parents('.grid-row-group');
						if(searchString.indexOf(searchValue) >= 0) {
							matchedResults = true;
							rowGroup.show();
						} else {
							var matched = _.find(cdr.bLegs, function(bLeg) {
								var searchStr = (bLeg.date + "|" + bLeg.fromName + "|" 
											  + bLeg.fromNumber + "|" + bLeg.toName + "|" 
											  + bLeg.toNumber + "|" + bLeg.hangupCause).toLowerCase();
								return searchStr.indexOf(searchValue) >= 0;
							});
							if(matched) {
								matchedResults = true;
								rowGroup.show();
							} else {
								rowGroup.hide();
							}
						}
					})
				}

				if(matchedResults) {
					template.find('.grid-row.no-match').hide();
				} else {
					template.find('.grid-row.no-match').show();
				}
			});

			template.find('.a-leg.has-b-legs').on('click', function(e) {
				var rowGroup = $(this).parents('.grid-row-group');
				if(rowGroup.hasClass('open')) {
					rowGroup.removeClass('open');
					rowGroup.find('.b-leg').slideUp();
				} else {
					template.find('.grid-row-group').removeClass('open');
					template.find('.b-leg').slideUp();
					rowGroup.addClass('open');
					rowGroup.find('.b-leg').slideDown();
				}
			});

			template.find('.grid-cell.details i').on('click', function(e) {
				e.stopPropagation();
				var cdrId = $(this).parents('.grid-row').data('id');
				self.callLogsShowDetailsPopup(cdrId);
			});

			template.find('.grid-cell.report a').on('click', function(e) {
				e.stopPropagation();
			});
		},

		callLogsInitDatepickers: function(template, fromDate, toDate) {
			var fromDateInput = template.find('.filter-div input.filter-from'),
				toDateInput = template.find('.filter-div input.filter-to');

			fromDateInput.datepicker({
				constrainInput: true,
				showOtherMonths: true,
				selectOtherMonths: true,
				onSelect: function(inputDate) {
					var selectedDate = new Date(inputDate),
						restrictTo = new Date(selectedDate),
						toDateTimestamp = toDateInput.datepicker("getDate").getTime();

					restrictTo.setDate(restrictTo.getDate()+7);
					console.log(restrictTo);
					toDateInput.datepicker("option", "minDate", selectedDate);
					toDateInput.datepicker("option", "maxDate", restrictTo);
					if(toDateTimestamp > restrictTo.getTime() || toDateTimestamp < selectedDate.getTime()) {
						toDateInput.datepicker("setDate", restrictTo);
					}
				}
			});
			fromDateInput.datepicker("setDate", fromDate);

			toDateInput.datepicker({
				constrainInput: true,
				showOtherMonths: true,
				selectOtherMonths: true,
				minDate: fromDate,
				maxDate: toDate
			});
			toDateInput.datepicker("setDate", toDate);
		},

		callLogsGetCdrs: function(fromDate, toDate, callback) {
			var self = this,
				fromDateTimestamp,
				toDateTimestamp;

			fromDate.setHours(0);
			fromDate.setMinutes(0);
			fromDate.setSeconds(0);
			fromDate.setMilliseconds(0);
			fromDateTimestamp = monster.util.dateToGregorian(fromDate);

			toDate.setHours(23);
			toDate.setMinutes(59);
			toDate.setSeconds(59);
			toDate.setMilliseconds(999);
			toDateTimestamp = monster.util.dateToGregorian(toDate);

			monster.request({
				resource: 'voip.callLogs.listCdrs',
				data: {
					accountId: self.accountId,
					fromDate: fromDateTimestamp,
					toDate: toDateTimestamp
				},
				success: function(data, status) {
					var cdrs = {};
					_.each(data.data, function(val) {
						if(val.direction === 'inbound') {
							if(!(val.id in cdrs)) { cdrs[val.id] = {}; }
							cdrs[val.id].aLeg = val;
						} else {
							if('other_leg_call_id' in val) {
								if(!(val.other_leg_call_id in cdrs)) { cdrs[val.other_leg_call_id] = {}; }
								if(!('bLegs' in cdrs[val.other_leg_call_id])) { cdrs[val.other_leg_call_id].bLegs = {}; }
								cdrs[val.other_leg_call_id].bLegs[val.id] = val;
							} else {
								console.log('IGNORED: '+val.id);
							}
						}
					});

					callback(cdrs);
				}
			});
		},

		callLogsFormatCdrs: function(cdrs) {
			var result = [],
				formatCdr = function(cdr) {
					var date = monster.util.gregorianToDate(cdr.timestamp),
						day = (date.getDate() < 10 ? "0" : "") + date.getDate(),
						month = (date.getMonth() < 9 ? "0" : "") + (date.getMonth()+1),
						year = date.getFullYear().toString().substr(2),
						hours = (date.getHours() < 10 ? "0" : "") + date.getHours(),
						minutes = (date.getMinutes() < 10 ? "0" : "") + date.getMinutes(),
						durationMin = parseInt(cdr.duration_seconds/60).toString(),
						durationSec = (cdr.duration_seconds % 60 < 10 ? "0" : "") + (cdr.duration_seconds % 60);

					return {
						id: cdr.id,
						timestamp: cdr.timestamp,
						date: month+"/"+day+"/"+year,
						time: hours+":"+minutes,
						fromName: cdr.caller_id_name,
						fromNumber: cdr.caller_id_number || cdr.from.replace(/@.*/, ''),
						toName: cdr.callee_id_name,
						toNumber: cdr.callee_id_number || ("request" in cdr) ? cdr.request.replace(/@.*/, '') : cdr.to.replace(/@.*/, ''),
						duration: durationMin + ":" + durationSec,
						hangupCause: cdr.hangup_cause,
						isOutboundCall: ("authorizing_id" in cdr)
					};
				};

			_.each(cdrs, function(val, key) {
				if(!('aLeg' in val)) {
					console.log('CLEANED: '+key);
					delete cdrs[key];
				} else {
					var cdr = formatCdr(val.aLeg);
					cdr.bLegs = [];
					_.each(val.bLegs, function(v, k) {
						cdr.bLegs.push(formatCdr(v));
					});
					result.push(cdr);
				}
			});

			result.sort(function(a, b) {
				return b.timestamp - a.timestamp;
			})

			return result;
		},

		callLogsShowDetailsPopup: function(callLogId) {
			var self = this;
			monster.request({
				resource: 'voip.callLogs.getCdr',
				data: {
					accountId: self.accountId,
					cdrId: callLogId
				},
				success: function(data, status) {
					function objToArray(obj, prefix) {
						var prefix = prefix || "",
							result = [];
						_.each(obj, function(val, key) {
							if(typeof val === "object") {
								result = result.concat(objToArray(val, prefix+key+"."));
							} else {
								result.push({
									key: prefix+key,
									value: val
								});
							}
						});
						return result;
					}

					monster.ui.dialog(
						monster.template(self, 'callLogs-detailsPopup', { details: objToArray(data.data) }), 
						{ title: self.i18n.active().callLogs.detailsPopupTitle }
					);
				},
				error: function(data, status) {
					monster.ui.alert('error', self.i18n.active().callLogs.alertMessages.getDetailsError);
				}
			});
		}
	};

	return app;
});
