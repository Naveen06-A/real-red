"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var cors_1 = require("cors");
var supabase_server_1 = require("./supabase-server");
var sgMail = require('@sendgrid/mail');
require("dotenv/config");

var app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: 'http://localhost:5173' }));
app.use(express_1.default.json());

// Set SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Create agent endpoint
app.post('/api/create-agent', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, email, permissions, name, phone, tempPassword, uniqueAgentId, _b, authData, authError, profileError, error_1;
    var _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _d.trys.push([0, 3, , 4]);
                _a = req.body, email = _a.email, permissions = _a.permissions, name = _a.name, phone = _a.phone;
                if (!email || !permissions || !name) {
                    res.status(400).json({ error: 'Email, name, and permissions are required' });
                    return [2 /*return*/];
                }
                tempPassword = Math.random().toString(36).slice(-8);
                uniqueAgentId = "AGENT-".concat(crypto.randomUUID().slice(0, 8));
                return [4 /*yield*/, supabase_server_1.supabaseServer.auth.admin.createUser({
                        email: email,
                        password: tempPassword,
                        email_confirm: true,
                        user_metadata: { name, phone },
                    })];
            case 1:
                _b = _d.sent(), authData = _b.data, authError = _b.error;
                if (authError) {
                    throw new Error("Auth error: ".concat(authError.message));
                }
                return [4 /*yield*/, supabase_server_1.supabaseServer.from('profiles').insert({
                        id: (_c = authData.user) === null || _c === void 0 ? void 0 : _c.id,
                        agent_id: uniqueAgentId,
                        email: email,
                        role: 'agent',
                        permissions: permissions,
                        name: name,
                        phone: phone,
                    })];
            case 2:
                profileError = (_d.sent()).error;
                if (profileError) {
                    throw new Error("Profile error: ".concat(profileError.message));
                }
                res.status(201).json({ agent_id: uniqueAgentId, email: email, tempPassword: tempPassword, name: name, message: 'Agent created successfully' });
                return [3 /*break*/, 4];
            case 3:
                error_1 = _d.sent();
                console.error('Error creating agent:', error_1);
                res.status(500).json({ error: error_1.message || 'Failed to create agent' });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });

// Send agent credentials email
app.post('/api/send-agent-credentials', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, email, password, name, subject, message, msg, error_2;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                _a = req.body, email = _a.email, password = _a.password, name = _a.name, subject = _a.subject, message = _a.message;
                if (!email || !password || !name || !subject || !message) {
                    res.status(400).json({ error: 'Email, password, name, subject, and message are required' });
                    return [2 /*return*/];
                }
                msg = {
                    to: email,
                    from: process.env.SENDGRID_FROM_EMAIL || 'your-email@yourdomain.com',
                    subject: subject,
                    text: message,
                    html: message.replace(/\n/g, '<br>'),
                };
                return [4 /*yield*/, sgMail.send(msg)];
            case 1:
                _b.sent();
                res.status(200).json({ message: 'Email sent successfully' });
                return [3 /*break*/, 3];
            case 2:
                error_2 = _b.sent();
                console.error('Error sending email:', error_2);
                res.status(500).json({ error: error_2.message || 'Failed to send email' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });

// Fetch agents endpoint
app.get('/api/agents', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, data, error, error_2;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                return [4 /*yield*/, supabase_server_1.supabaseServer
                        .from('profiles')
                        .select('id, agent_id, email, role, permissions, name, phone')
                        .eq('role', 'agent')];
            case 1:
                _a = _b.sent(), data = _a.data, error = _a.error;
                if (error)
                    throw new Error("Failed to fetch agents: ".concat(error.message));
                res.status(200).json(data || []);
                return [3 /*break*/, 3];
            case 2:
                error_2 = _b.sent();
                console.error('Error fetching agents:', error_2);
                res.status(500).json({ error: error_2.message || 'Failed to fetch agents' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });

// Update agent permissions endpoint
app.post('/api/update-agent-permissions', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, agentId, permissions, error, error_3;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                _a = req.body, agentId = _a.agentId, permissions = _a.permissions;
                if (!agentId || !permissions) {
                    res.status(400).json({ error: 'Agent ID and permissions are required' });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, supabase_server_1.supabaseServer
                        .from('profiles')
                        .update({ permissions: permissions })
                        .eq('id', agentId)];
            case 1:
                error = (_b.sent()).error;
                if (error)
                    throw new Error("Failed to update permissions: ".concat(error.message));
                res.status(200).json({ message: 'Agent permissions updated successfully' });
                return [3 /*break*/, 3];
            case 2:
                error_3 = _b.sent();
                console.error('Error updating agent permissions:', error_3);
                res.status(500).json({ error: error_3.message || 'Failed to update agent permissions' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });

var PORT = process.env.PORT || 3001;
app.listen(PORT, function () { return console.log("Server running on port ".concat(PORT)); });