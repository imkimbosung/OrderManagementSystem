'use strict';

var async = require('async');
var jwt = require('jsonwebtoken');
var bcrypt = require('bcrypt');
var value_checker = require('../helper/value_checker');
var error_handler = require('../helper/error_handler');
var fs = require('fs');
var app = require('../app');
var FileStreamRotator = require('file-stream-rotator');
var path = require('path');

var ssl_privatekey = fs.readFileSync(__dirname + '/../ssl/server.key');

var loginLogStream = FileStreamRotator.getStream({
    date_format: 'YYYY-MM-DD',
    filename: path.join(__dirname, '../', 'log', 'login-%DATE%.txt'),
    frequency: 'daily',
    verbose: false
});

function signin(req, res, next) {

    //필수 정보 받기.
    var email = req.body.email;
    var password = req.body.password;

    //빈 값이 있는지 확인.
    var checklist = [email, password];
    if(value_checker.is_empty_check(checklist)) {
        error_handler.custom_error_handler(400, 'Required value is empty!', null, next);
        return;
    }

    //로그인 검증 시작.
    async.series([
        //회원정보 확인
        function(callback) {
            let queryStr = "SELECT * FROM `users` WHERE `email` = ?";
            let queryVal = [email];
            app.db_connection.query(queryStr, queryVal, function(err, rows, fields) {
                if(err) {
                    callback(err);
                }
                else {
                    if(rows.length == 0 || !bcrypt.compareSync(password, rows[0].password)) {
                        error_handler.custom_error_handler(400, 'Wrong ID or password!', null, next);
                        return;
                    }
                    else if(rows[0].is_active != 1) {
                        error_handler.custom_error_handler(401, 'This account is not activated yet!', null, next);
                        return;
                    }
                    else {
                        callback(null, rows[0]);
                    }
                }
            });
        }
    ],
    function(err, results) {
        
        //Generate JWT
        var token = jwt.sign({
            uid: results[0].id,
            name: results[0].name,
            email: results[0].email,
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        }, ssl_privatekey, {
            expiresIn: "12h",
            algorithm: 'RS256'
        });

        error_handler.async_final(err, res, next, token);

        var login_log_data = "";
        login_log_data += "<<Login Time>>\n";
        login_log_data += new Date() + "\n";
        login_log_data += "<<Login info>>\n";
        login_log_data += JSON.stringify(value_checker.jwt_checker(token)) + "\n";
        login_log_data += "<<Login IP>>\n";
        login_log_data += req.ip + "\n";
        login_log_data += "\n";

        loginLogStream.write(login_log_data);
        
    });
}

function signup(req, res, next) {

    //필수 정보 받기.
    var name = req.body.name;
    var email = req.body.email;
    var password = req.body.password;

    //빈 값이 있는지 확인.
    var checklist = [name, email, password];
    if(value_checker.is_empty_check(checklist)) {
        error_handler.custom_error_handler(400, 'Required value is empty!', null, next);
        return;
    }

    //정규표현식 검사
    var regExp1 = /^[A-Za-z0-9+]*$/;
    var regExp2 = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if(!regExp1.test(email) && !regExp2.test(email)) {
        error_handler.custom_error_handler(400, 'ID must be combination of alphabet and number, or email form!', null, next);
        return;
    }

    //회원가입 절차 시작
    async.series([
        //회원정보 중복검사
        function(callback) {
            let queryStr = "SELECT * FROM `users` WHERE `email` = ?";
            let queryVal = [email];
            app.db_connection.query(queryStr, queryVal, function(err, rows, fields) {
                if(err) {
                    callback(err);
                }
                else {
                    if(rows.length == 0) {
                        callback(null);
                    }
                    else {
                        error_handler.custom_error_handler(400, 'ID already exists!', null, next);
                        return;
                    }
                }
            });
        },
        //회원정보 추가
        function(callback) {
            let queryStr = "INSERT INTO `users` SET ?";
            let queryVal = {
                name: name,
                email: email,
                password: bcrypt.hashSync(password, bcrypt.genSaltSync(10)),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            app.db_connection.query(queryStr, queryVal, function(err, rows, fields) {
                if(err) {
                    callback(err);
                }
                else {
                    callback(null);
                }
            });
        }
    ],
    function(err, results) {
        error_handler.async_final(err, res, next, null);
    });
}

exports.signin = signin;
exports.signup = signup;