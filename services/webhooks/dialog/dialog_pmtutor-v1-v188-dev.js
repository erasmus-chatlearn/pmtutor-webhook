// copy and adapt from IBM Cloud Function dialog-skill-chatlearn-pm-tutor-snapshot-v188
// update the dbs to use sandbox dbs
const { CloudantV1 } = require('@ibm-cloud/cloudant');
const { IamAuthenticator } = require('ibm-cloud-sdk-core');
const { CLOUDANT_URL, CLOUDANT_API_KEY, OPENAI_API_KEY} = require('../../../config');
// OpenAI
const axios = require('axios');

// Cloudant-Chatlearn
const topicDatabase = "topics-sandbox";
const userProfileDatabase = 'user-profile-sandbox';
const userSessionEventDatabase = 'user-session-events-sandbox';
const feedbackDatabase = 'feedback-sandbox';

const authenticator = new IamAuthenticator({apikey: CLOUDANT_API_KEY});
const client = CloudantV1.newInstance({authenticator: authenticator, serviceUrl: CLOUDANT_URL});

function main(params) {

    if (!params || !params.hasOwnProperty('action')) {
        return customErrorMsg('action parameter is not provided', 400);
    }

    if (params.action === 'getAllTopics') {
        return getLearningTopics();
    }

    if (params.action === 'getUserBasicInfo') {
        if (!params.hasOwnProperty('userId')) {
            return customErrorMsg('userId is absent', 400);
        }
        return getUserBasicInfoByUserId(params.userId);
    }

    if (params.action === 'createUserBasicInfo') {
        if (!params.hasOwnProperty('userId')) {
            return customErrorMsg('userId is absent', 400);
        }
        if (!params.hasOwnProperty('username')) {
            return customErrorMsg('username is absent', 400);
        }
        return createUserBasicInfoByUserIdAndUsername(params.userId, params.username);
    }

    if (params.action === 'updateUserBasicInfo') {
        if (!params.hasOwnProperty('userBasicInfo')) {
            return customErrorMsg('userBasicInfo is absent', 400);
        }
        return updateUserProfileDocument(params.userBasicInfo);
    }

    if (params.action === 'getLastUserSessionInfo') {
        if (!params.hasOwnProperty('userId') || !params.hasOwnProperty('sessionId')) {
            return customErrorMsg('userId or sessionId is absent', 400);
        }
        if (params.hasOwnProperty('userLanguage') && params.hasOwnProperty('userTimezone')) {
            return getLastSessionInfoInUserLocalTimeExcludingSessionId(
                params.userId,
                params.sessionId,
                params.userLanguage,
                params.userTimezone);
        }
        return getLastSessionInfoExcludingSessionId(params.userId, params.sessionId);
    }

    if (params.action === 'createUserSessionInfo') {
        if (!params.hasOwnProperty('userId') || !params.hasOwnProperty('sessionId') || !params.hasOwnProperty('sessionStartedAt')) {
            return customErrorMsg('userId, sessionId or sessionStartedAt is absent', 400);
        }
        const unixTimestamp = Date.parse(params.sessionStartedAt);
        if(isNaN(unixTimestamp)) {
            return customErrorMsg('sessionStartedAt is not ISO 8601 format', 400);
        }
        return createUserSessionInfo(params.userId, params.sessionId, unixTimestamp);
    }

    if (params.action === 'createSessionEvent') {
        if (!params.hasOwnProperty('userId') || !params.hasOwnProperty('sessionId') ||
            !params.hasOwnProperty('sessionEventTypeId')) {
            return customErrorMsg('userId, sessionId or sessionEventTypeId is absent', 400);
        }
        let context, userExerciseInfoId, questionId, userInput = null;
        if (params.hasOwnProperty('context')) {
            context = params.context;
        }
        if (params.hasOwnProperty('userExerciseInfoId')) {
            userExerciseInfoId = params.userExerciseInfoId;
        }
        if (params.hasOwnProperty('questionId')) {
            questionId = params.questionId;
        }
        if (params.hasOwnProperty('userInput')) {
            userInput = params.userInput;
        }
        return createSessionEvent(params.userId, params.sessionId, params.sessionEventTypeId, context, userExerciseInfoId, questionId, userInput);
    }

    if (params.action === 'createUserExerciseInfo') {
        const inputValidation = inputValidationUserExerciseInfo(params);
        if ( !inputValidation.isValid ) {
            return customErrorMsg(inputValidation.reason, 400);
        }
        return createUserExerciseInfo(
            params.userBasicInfoId,
            params.userSessionInfoId,
            params.exerciseId,
            params.exerciseName,
            params.learningModuleReferenceId,
            params.learningModuleName,
            params.topicConfigId,
            params.topicName,
            params.createdAt
        );
    }

    if (params.action === 'setIsCompletedTrueToUserExerciseInfo') {
        if (!params.hasOwnProperty('docId')) {
            return customErrorMsg('docId is absent', 400 );
        } else if (!params.hasOwnProperty('completedAt')) {
            return customErrorMsg('completedAt is absent', 400 );
        } else if (isNaN(params.completedAt)) {
            return customErrorMsg('completedAt should be a 13-digits number representing milliseconds', 400 );
        } else {
            return setIsCompletedTrueToUserExerciseInfo(params.docId, params.completedAt);
        }
    }

    if (params.action === 'getCategorizedUserExerciseInfosByUserSessionInfoId') {
        if (!params.hasOwnProperty('userSessionInfoId')) {
            return customErrorMsg('userSessionInfoId is absent', 400 );
        }
        return getCategorizedUserExerciseInfos(params.userSessionInfoId);
    }

    if (params.action === 'getIncompleteExerciseByUserExerciseInfoId') {
        if (!params.hasOwnProperty('userId')) {
            return customErrorMsg('userId is absent', 400);
        } else if (!params.hasOwnProperty('lastSessionId')) {
            return customErrorMsg('lastSessionId is absent', 400);
        } else if (!params.hasOwnProperty('userExerciseInfoId')) {
            return customErrorMsg('userExerciseInfoId is absent', 400);
        } else {
            const sessionEventTypeId = 'sessionEventType:doExercise';
            return getLatestDoExerciseEventLog(
                params.userId,
                params.lastSessionId,
                sessionEventTypeId,
                params.userExerciseInfoId);
        }
    }

    if (params.action === 'getExerciseById') {
        if (!params.hasOwnProperty('exerciseId')) {
            return customErrorMsg('exerciseId is missing', 400);
        }
        return getExerciseById(params.exerciseId);
    }

    if (params.action === 'getLearningMaterialsByModuleRefId') {
        if (!params.hasOwnProperty('moduleRefId')) {
            return customErrorMsg('moduleRefId is missing', 400);
        }
        // return getLearningMaterialsByModuleRefId(params.moduleRefId);
        return getDocsByDocTypeScopeAndRefIdFromTopicDB('learningMaterial', 'module', params.moduleRefId);
    }

    if (params.action === 'getLearningMaterialsByTopicConfigId') {
        if (!params.hasOwnProperty('topicConfigId')) {
            return customErrorMsg('topicConfigId is missing', 400);
        }
        return getDocsByDocTypeScopeAndRefIdFromTopicDB('learningMaterial', 'topic', params.topicConfigId);
    }

    if (params.action === 'getExercisesByModuleRefId') {
        if (!params.hasOwnProperty('moduleRefId')) {
            return customErrorMsg('moduleRefId is missing', 400);
        }
        return getDocsByDocTypeAndLearningModuleRefId('exercise', params.moduleRefId);
    }

    if (params.action === 'getExercisesByTopicConfigId') {
        if (!params.hasOwnProperty('topicConfigId')) {
            return customErrorMsg('topicConfigId is missing', 400);
        }
        return getDocsByDocTypeAndTopicConfigId('exercise', params.topicConfigId);
        // return getDocsByDocTypeScopeAndRefIdFromTopicDB('exercise', 'topic', params.topicConfigId);
    }

    if (params.action === 'getLearningMaterialsAndExercisesByScopeAndScopeRefId') {
        if (!params.hasOwnProperty('scope') || !params.hasOwnProperty('scopeRefId')) {
            return customErrorMsg('scope and/or scopeRefId is missing', 400);
        }
        return getExercisesAndMaterialsByScopeAndRefIdFromTopicDB(params.scope, params.scopeRefId);
    }

    if (params.action === 'consultOpenAI') {
        if (!!params.hasOwnProperty('userInput')) {
            return consultOpenAI(params.userInput);
        }
        return customErrorMsg('user input is missing', 400);
    }

    if (params.action === 'createOptionsForTopic') {
        if (!params.hasOwnProperty('jsonObject')) {
            return customErrorMsg('jsonObject parameter is missing', 400);
        }
        // const parsedJson = JSON.parse(params.jsonObject);
        if (!params.jsonObject.hasOwnProperty('learningModules')) {
            return customErrorMsg('learningModules is missing from the jsonObject', 400);
        }
        const learningModuleOptions = createCustomOptions(params.jsonObject.learningModules, 'Please select an option to proceed:', 'name', 'referenceId', 'Get module content for');
        const additionalOptions = [
            {label: 'List all learning materials', value: 'get all learning materials'},
            {label: 'List all exercises', value: 'get all exercises'}
        ];
        const customOptions = addOptionsToCustomOptions(learningModuleOptions, additionalOptions, 'label', 'value');
        return new Promise(resolve => {resolve(customOptions)});
    }

    if (params.action === 'createPersonalizedOptionsForTopic') {
        if (!params.hasOwnProperty('jsonObject')) {
            return customErrorMsg('jsonObject parameter is missing', 400);
        }
        // const parsedJson = JSON.parse(params.jsonObject);
        if (!params.jsonObject.hasOwnProperty('learningModules')) {
            return customErrorMsg('learningModules is missing from the jsonObject', 400);
        }
        if (!params.hasOwnProperty('hasDonePreUsageSurvey')) {
            return customErrorMsg('hasDonePreUsageSurvey is missing', 400)
        }
        if (!params.hasOwnProperty('topicName')) {
            return customErrorMsg('topicName is missing', 400)
        }
        const learningModuleOptions = createCustomOptions(params.jsonObject.learningModules, 'Please select an option to proceed:', 'name', 'referenceId', 'Get module content for');
        let additionalOptions = [
            {label: 'List all learning materials', value: 'get all learning materials'},
            {label: 'List all exercises', value: 'get all exercises'},
            {label: 'See another topic', value: 'see another topic'}
        ];
        if (params.hasDonePreUsageSurvey) {
            additionalOptions = [
                {label: 'List all learning materials', value: 'get all learning materials'},
                {label: 'List all exercises', value: 'get all exercises'},
                {label: `Do self assessment on ${params.topicName}`, value: `do self assessment on ${params.topicName}`},
                {label: 'See another topic', value: 'see another topic'}
            ]
        }
        const customOptions = addOptionsToCustomOptions(learningModuleOptions, additionalOptions, 'label', 'value');
        return new Promise(resolve => {resolve(customOptions)});
    }

    if (params.action === 'getLatestActiveSurvey') {
        if (!params.hasOwnProperty('surveyType')) {
            return customErrorMsg('surveyType parameter is missing', 400)
        }
        return getLatestActiveSurvey(params.surveyType)
    }

    if (params.action === 'getLatestActiveSurveyByOrgIdAndSurveyType') {
        if (!params.hasOwnProperty('surveyType')) {
            return customErrorMsg('surveyType parameter is missing', 400)
        } else if(!params.hasOwnProperty('orgId')) {
            return customErrorMsg('orgId parameter is missing', 400)
        } else {
            return getLatestActiveSurveyByOrgIdAndSurveyType(params.orgId, params.surveyType);
        }
    }

    if (params.action === 'createUserSurvey') {
        if (!params.hasOwnProperty('userBasicInfoId')) {
            return customErrorMsg('userBasicInfoId is missing from the params', 400);
        } else if (!params.hasOwnProperty('surveyId')) {
            return customErrorMsg('surveyId is missing from the params', 400);
        } else if (!params.hasOwnProperty('surveyName')) {
            return customErrorMsg('surveyName is missing from the params', 400);
        } else if (!params.hasOwnProperty('surveyType')) {
            return customErrorMsg('surveyType is missing from the params', 400);
        } else {
            return createUserSurvey(params.userBasicInfoId, params.surveyId, params.surveyName, params.surveyType);
        }
    }

    if (params.action === 'getUserSurveyByDocId') {
        if (!params.hasOwnProperty('docId')) {
            return customErrorMsg('docId parameter is missing.', 400);
        }
        return getDocumentByDbNameAndDocId(userProfileDatabase, params.docId);
    }

    if (params.action === 'createUserSurveyAnswer') {
        if (!params.hasOwnProperty('userBasicInfoId')) {
            return customErrorMsg('userBasicInfoId is missing', 400);
        } else if (!params.hasOwnProperty('userSurveyId')) {
            return customErrorMsg('userSurveyId is missing', 400);
        } else if (!params.hasOwnProperty('surveyId')) {
            return customErrorMsg('surveyId is missing', 400);
        } else if (!params.hasOwnProperty('surveySectionId')) {
            return customErrorMsg('surveySectionId is missing', 400);
        } else if (!params.hasOwnProperty('surveySectionName')) {
            return customErrorMsg('surveySectionName is missing', 400);
        } else if (!params.hasOwnProperty('questionId')) {
            return customErrorMsg('questionId is missing', 400);
        } else if (!params.hasOwnProperty('questionType')) {
            return customErrorMsg('questionType is missing', 400);
        } else if (!params.hasOwnProperty('questionDescription')) {
            return customErrorMsg('questionDescription is missing', 400);
        } else if (!params.hasOwnProperty('expectedValueType')) {
            return customErrorMsg('expectedValueType is missing', 400);
        } else if (!params.hasOwnProperty('isSA')) {
            return customErrorMsg('isSA is missing', 400);
        } else if (!params.hasOwnProperty('value')) {
            return customErrorMsg('value is missing', 400);
        } else {
            return createUserSurveyAnswerAndUpdateUserSurveySummary(
                params.userBasicInfoId,
                params.userSurveyId,
                params.surveyId,
                params.surveySectionId,
                params.surveySectionName,
                params.questionId,
                params.questionType,
                params.questionDescription,
                params.expectedValueType,
                params.isSA,
                params.value
            );
            // return createUserSurveyAnswer(
            //     params.userBasicInfoId,
            //     params.userSurveyId,
            //     params.surveyId,
            //     params.surveySectionId,
            //     params.surveySectionName,
            //     params.questionId,
            //     params.questionType,
            //     params.questionDescription,
            //     params.expectedValueType,
            //     params.isSA,
            //     params.value
            // );
        }
    }

    if (params.action === 'updateUserBasicInfoAndUserSurvey') {
        if(!params.hasOwnProperty('userBasicInfo')) {
            return customErrorMsg('userBasicInfo is missing', 400);
        } else if (!params.hasOwnProperty('userSurvey')) {
            return customErrorMsg('userSurvey is missing', 400);
        } else {
            const updatedAt = Date.now();
            let userSurvey = params.userSurvey;
            userSurvey.isCompleted = true;
            userSurvey.updatedAt = updatedAt;
            let userBasicInfo = params.userBasicInfo;
            userBasicInfo.updatedAt = updatedAt;
            if (userSurvey.surveyType === 'preUsageSurvey') {
                userBasicInfo.hasAnsweredPreUsageSurvey = true;
            } else {
                userBasicInfo.hasAnsweredFinalSurvey = true;
            }
            const docs = [userSurvey, userBasicInfo]
            return updateMultipleDocuments(userProfileDatabase, docs);
        }
    }

    if (params.action === 'getLastUserSurveyAnswer') {
        if (!params.hasOwnProperty('userSurveyId') || !params.userSurveyId) {
            return customErrorMsg('userSurveyId is missing', 400)
        } else {
            const partitionKeyAndCreatedAt = params.userSurveyId.split(':');
            if (partitionKeyAndCreatedAt.length !== 2 || isNaN(parseInt(partitionKeyAndCreatedAt[1]))) {
                return customErrorMsg('UserSurveyId is invalid', 400);
            }
            const partitionKey = partitionKeyAndCreatedAt[0];
            const selector = {
                'docType': 'userSurveyAnswer',
                'userSurveyId': params.userSurveyId,
                'createdAt': {'$gte': parseInt(partitionKeyAndCreatedAt[1])}
            };
            let sort = [{'createdAt': 'desc'}];
            return postPartitionFind(userProfileDatabase, partitionKey, selector, sort, 1);
        }
    }

    if (params.action === 'getLastUserSurvey') {
        if (!params.hasOwnProperty('userBasicInfoId')) {
            return customErrorMsg('userBasicInfoId is missing', 400);
        } else if (!params.hasOwnProperty('surveyId')) {
            return customErrorMsg('surveyId is missing', 400);
        } else if(!params.hasOwnProperty('surveyType')) {
            return customErrorMsg('surveyType is missing', 400);
        } else {
            const userId = params.userBasicInfoId.split(':')[0];
            const partitionKey = `${userId}-${params.surveyType}`;
            const selector = {
                'docType': 'userSurvey',
                'userBasicInfoId': params.userBasicInfoId,
                'surveyId': params.surveyId
            };
            const sort = [{'createdAt': 'desc'}];
            return postPartitionFind(userProfileDatabase, partitionKey, selector, sort, 1);
        }
    }

    if (params.action === 'getSelfAssessmentAnalyticsFromCompletedSurvey') {
        if (!params.hasOwnProperty('surveyType')) {
            return customErrorMsg('surveyType is missing', 400);
        } else if (!params.hasOwnProperty('userBasicInfoId')) {
            return customErrorMsg('userBasicInfoId is missing', 400);
        } else {
            return analyzeSelfAssessmentsFromSurvey(params.surveyType, params.userBasicInfoId, true);
        }
    }

    if (params.action === 'checkIfUserCompletedModuleExercises') {
        if (!params.hasOwnProperty('userBasicInfoId')) {
            return customErrorMsg('userBasicInfoId is missing', 400);
        } else if (!params.hasOwnProperty('topicConfigId')) {
            return customErrorMsg('topicConfigId is missing', 400);
        } else if (!params.hasOwnProperty('moduleRefId')) {
            return customErrorMsg('moduleRefId is missing', 400);
        } else if (!params.hasOwnProperty('moduleName')) {
            return customErrorMsg('moduleName is missing', 400);
        } else {
            return checkHasUserCompletedModuleExercises(
                params.userBasicInfoId,
                params.topicConfigId,
                params.moduleRefId,
                params.moduleName
            );
        }
    }

    if (params.action === 'createOptionsFromArray') {
        if (!params.hasOwnProperty('keyValueArray')) {
            return customErrorMsg('keyValueArray is missing', 400);
        } else if (!params.hasOwnProperty('optionTitle')) {
            return customErrorMsg('optionTitle is missing', 400);
        } else if (!params.hasOwnProperty('isTitleBold')) {
            return customErrorMsg('isTitleBold is missing', 400);
        } else if (!params.hasOwnProperty('labelField')) {
            return customErrorMsg('labelField is missing', 400);
        } else if (!params.hasOwnProperty('valueField')) {
            return customErrorMsg('valueField is missing', 400);
        } else if (!params.hasOwnProperty('valuePrefix')) {
            return customErrorMsg('valuePrefix is missing', 400);
        } else {
            return createCustomOptionsFromKeyValueArr(
                params.keyValueArray,
                params.optionTitle,
                params.isTitleBold,
                params.labelField,
                params.valueField,
                params.valuePrefix
            );
        }
    }

    if (params.action === 'analyzeUserSASummary') {
        if (!params.hasOwnProperty('userBasicInfoId')) {
            return customErrorMsg('userBasicInfoId is missing', 400);
        } else {
            // return analyzeSelfAssessmentsFromUserSASummary(params.userBasicInfoId);
            return analyzeCompletedTopicSelfAssessmentsFromUserSASummary(params.userBasicInfoId);
        }
    }

    if (params.action === 'getSelfAssessmentStatementsByTopic') {
        if (!params.hasOwnProperty('topicConfigId')) {
            return customErrorMsg('topicConfigId is missing', 400);
        } else {
            const fields = ['_id', 'description'];
            return getActiveSASByTopicConfigId(params.topicConfigId, fields);
        }
    }

    if (params.action === 'createUserLikertSelfAssessment') {
        if (!params.hasOwnProperty('userBasicInfoId')) {
            return customErrorMsg('userBasicInfoId is missing', 400);
        } else if (!params.hasOwnProperty('SASId')) {
            return customErrorMsg('SASId is missing', 400);
        } else if (!params.hasOwnProperty('SAS')) {
            return customErrorMsg('SAS is missing', 400);
        } else if (!params.hasOwnProperty('value')) {
            return customErrorMsg('value is missing', 400);
        } else {
            return createUserFivePointLikertSelfAssessmentAndUpdateUserSASummary(
                params.userBasicInfoId,
                params.SASId,
                params.SAS,
                params.value
            );
        }
    }

    if (params.action === 'getSummaryOfUserExercises') {
        if (!params.hasOwnProperty('userBasicInfoId')) {
            return customErrorMsg('userBasicInfoId is missing', 400);
        } else {
            return getExerciseSummary(params.userBasicInfoId);
        }
    }

    if (params.action === 'createCustomOptionsForIncompleteTopics') {
        if (!params.hasOwnProperty('userExerciseSummary')) {
            return customErrorMsg('userExerciseSummary is missing', 400);
        } else if (!params.hasOwnProperty('userBasicInfoId')) {
            return customErrorMsg('userBasicInfoId is missing', 400);
        }
        return createCustomOptionsForTopicsWithIncompleteExercises(params.userBasicInfoId, params.userExerciseSurvey);
    }

    if (params.action === 'getActiveSASbyExerciseId') {
        if (!params.hasOwnProperty('exerciseId')) {
            return customErrorMsg('exerciseId is missing', 400);
        }
        const partKey = params.exerciseId.split(':')[0];
        const returnedFields = ['_id', 'description'];
        return getActiveSASByPartKeyAndScopeAndScopeRefId(partKey, 'exercise', params.exerciseId, returnedFields);
    }

    if (params.action === 'giveAnonymousFeedback') {
        if (!params.hasOwnProperty('category') || !params.category) {
            return customErrorMsg('category is missing', 400);
        } else if (!params.hasOwnProperty('feedback')) {
            return customErrorMsg('feedback is missing', 400);
        }else {
            return createAnonymousFeedback(params.category.trim(), params.feedback);
        }
    }

    return customErrorMsg('the action parameter is not valid', 400);
}

function customErrorMsg(msg, httpStatus) {
    const err = { errMsg: msg, httpStatus: httpStatus };
    return new Promise((resolve) => {
        resolve(err);
    });
}

function msgFromSDKError(sdkError) {
    let msg, status;
    if (sdkError.hasOwnProperty('statusText')) {
        msg = sdkError.statusText;
    } else if (sdkError.hasOwnProperty('message')) {
        msg = sdkError.message;
    } else {
        msg = 'There is an SDK error';
    }

    if (sdkError.hasOwnProperty('status')) {
        status = sdkError.status;
    } else {
        status = null;
    }
    return customErrorMsg(msg, status);
}

function createOptionResponse(title, arr) {
    const customRes = {
        optionResponse: [{
            response_type: 'option',
            description: '',
            title: title,
            options: []
        }]
    };
    if (Array.isArray(arr) && arr.length > 0) {
        for (const item of arr) {
            if (!!item.name) {
                const o = {
                    label: item.name,
                    value: {
                        input: {
                            text: item._id
                        }
                    }
                };
                customRes.optionResponse[0].options.push(o);
            }
        }
    }
    return customRes;
}

function validateDocForUpdate(doc) {
    let result = {
        isValid: false,
        reason: null
    };
    if ( !!doc === false ) {
        result.reason = 'missing or invalid doc object';
    } else if ( !!doc._id === false ) {
        result.reason = 'missing or invalid doc._id';
    } else if ( !!doc._rev === false ) {
        result.reason = 'missing or invalid doc._rev';
    } else if (doc.hasOwnProperty('createdAt') && typeof (doc.createdAt) === "string") {
        result.reason = 'createdAt should be 13-digit numbers representing milliseconds timestamp';
    } else if (doc.hasOwnProperty('updatedAt') && typeof (doc.updatedAt) === "string") {
        result.reason = 'updatedAt should be 13-digit numbers representing milliseconds timestamp';
    } else if (doc.hasOwnProperty('completedAt') && isNaN(doc.completedAt)) {
        result.reason = 'completedAt should be 13-digit numbers representing milliseconds timestamp';
    } else {
        result.isValid = true;
    }
    return result;
}

function inputValidationUserExerciseInfo(params) {
    let result = {
        isValid: false,
        reason: null
    }
    if( params.action === 'updateUserExerciseInfo' ) {
        result = validateDocForUpdate(params.userExerciseInfo);
    } else {
        if (!params.hasOwnProperty('userBasicInfoId')) {
            result.reason = 'userBasicInfoId is absent';
        } else if (!params.hasOwnProperty('userSessionInfoId')) {
            result.reason = 'userSessionInfoId is absent';
        } else if (!params.hasOwnProperty('exerciseId')) {
            result.reason = 'exerciseId is absent';
        } else if (!params.hasOwnProperty('exerciseName')) {
            result.reason = 'exerciseName is absent';
        } else if (!params.hasOwnProperty('learningModuleRefId')) {
            result.reason = 'learningModuleRefId is absent';
        } else if (!params.hasOwnProperty('learningModuleName')) {
            result.reason = 'learningModuleName is absent';
        } else if (!params.hasOwnProperty('topicConfigId')) {
            result.reason = 'topicConfigId is absent';
        } else if (!params.hasOwnProperty('topicName')) {
            result.reason = 'topicName is absent';
        } else if (!params.hasOwnProperty('createdAt')) {
            result.reason = 'createdAt is absent';
        } else if (isNaN(params.createdAt)) {
            result.reason = 'createdAt should be a 13-digits timestamp';
        } else {
            result.isValid = true;
        }
    }
    return result;
}
// OpenAI
async function consultOpenAI(userInput) {

    const requestParams = {
        method: "post",
        url: "https://api.openai.com/v1/completions",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + OPENAI_API_KEY
        },
        data: {
            "model": "gpt-3.5-turbo-instruct",
            "prompt": userInput,
            "temperature": 0.6,
            "max_tokens": 2048
        }
    }

    let completion;
    try {
        completion = await axios(requestParams);
    } catch (e) {
        console.log(e);
        return msgFromSDKError(e);
    }

    return new Promise((resolve) => {
        let response = {status: completion.status, statusText: completion.statusText, GPTAnswer:''};
        if ( response.status === 200) {
            response.GPTAnswer = completion.data.choices[0].text.replace(/\n/g, '');
            response.usage = completion.data.usage;
            resolve(response);
        }
        resolve(response);
    });
}

async function getLearningTopics() {
    // get all topic configs
    const reqParams = {
        db: topicDatabase,
        selector: {
            docType: 'topicConfig'
        }
    }

    let topics;
    try {
        topics = await client.postFind(reqParams);
    } catch (e) {
        return msgFromSDKError(e);
    }

    let topicOptions;
    if (topics.result.docs.length > 0) {
        let optionTitle = 'Please select a topic from the list below:'
        topicOptions = createOptionResponse(optionTitle, topics.result.docs);
    }

    return new Promise(resolve => {
        if (topicOptions) {
            resolve({
                docs: topics.result.docs,
                customResponse: topicOptions
            });
        } else {
            resolve({docs: topics.result.docs});
        }
    });
}

async function getExerciseById(exerciseId) {
    const reqParams = {
        db: topicDatabase,
        docId: exerciseId
    };
    let exercise;

    try {
        exercise = await client.getDocument(reqParams);
    } catch (e) {
        return msgFromSDKError(e);
    }

    return new Promise(resolve => {
        resolve({result: exercise.result});
    });
}

async function getDocsByDocTypeAndLearningModuleRefId(docType, moduleRefId) {
    let funcResponse;
    try {
        funcResponse = await getDocsByDocTypeScopeAndRefIdFromTopicDB(docType, 'module', moduleRefId)
    } catch (e) {
        return msgFromSDKError(e);
    }
    // console.log(funcResponse);
    if (funcResponse.hasOwnProperty('errMsg')) {
        return Promise.resolve(funcResponse);
    }

    if (funcResponse.docType === 'exercise' && funcResponse.docs.length > 1) {
        const optionTitle = 'You can select an exercise below:';
        const labelField = 'name';
        const valueField = '_id';
        const valuePrefix = null;
        funcResponse.customResponse = createCustomOptions(funcResponse.docs, optionTitle, labelField, valueField, valuePrefix);
    }

    return new Promise(resolve => {
        resolve(funcResponse);
    });
}

async function getDocsByDocTypeAndTopicConfigId(docType, topicConfigId) {
    let funcResponse;
    try {
        funcResponse = await getDocsByDocTypeScopeAndRefIdFromTopicDB(docType, 'topic', topicConfigId)
    } catch (e) {
        return msgFromSDKError(e);
    }
    // console.log(funcResponse);
    if (funcResponse.hasOwnProperty('errMsg')) {
        return Promise.resolve(funcResponse);
    }

    if (funcResponse.docType === 'exercise' && funcResponse.docs.length > 1) {
        const optionTitle = 'You can select an exercise below:';
        const labelField = 'name';
        const valueField = '_id';
        const valuePrefix = null;
        funcResponse.customResponse = createCustomOptions(funcResponse.docs, optionTitle, labelField, valueField, valuePrefix);
    }

    return new Promise(resolve => {
        resolve(funcResponse);
    });
}

function createCustomOptions(arr, optionTitle, arrItemFieldForOptionLabel, arrItemFieldForOptionValue, optionValuePrefix) {
    const customOptions = {
        optionResponse: [{
            response_type: 'option',
            description: '',
            title: optionTitle,
            options: []
        }]
    };
    if (Array.isArray(arr) && arr.length > 0) {
        for (const item of arr) {
            if (!!item[arrItemFieldForOptionLabel]) {
                const o = {
                    label: item[arrItemFieldForOptionLabel],
                    value: {
                        input: {
                            text: !!optionValuePrefix ? optionValuePrefix + ' ' + item[arrItemFieldForOptionValue] : item[arrItemFieldForOptionValue]
                        }
                    }
                };
                customOptions.optionResponse[0].options.push(o);
            }
        }
    }
    return customOptions;
}

function addOptionsToCustomOptions(customOptions, additionalOptionArr, arrItemFieldForOptionLabel, arrItemFieldForOptionValue) {
    const additionalOptions = [];
    if (Array.isArray(additionalOptionArr) && additionalOptionArr.length > 0) {
        for (const item of additionalOptionArr) {
            if (!!item[arrItemFieldForOptionLabel]) {
                const o = {
                    label: item[arrItemFieldForOptionLabel],
                    value: {
                        input: {
                            text: item[arrItemFieldForOptionValue]
                        }
                    }
                };
                customOptions.optionResponse[0].options.push(o);
            }
        }
    }
    if ( additionalOptions.length > 0 ) {
        customOptions.optionResponse[0].options = customOptions.optionResponse[0].options.concat(additionalOptions);
    }
    return customOptions;
}

function createPostFindParams(dbName, docType, scope, refId) {
    let params = {
        db: dbName,
        selector: {
            docType: docType
        }
    };
    if (scope === 'module') {
        params.selector.learningModuleReferenceId = refId;
    }
    if (scope === 'topic') {
        params.selector.topicConfigId = refId;
    }
    return params;
}
async function getDocsByDocTypeScopeAndRefIdFromTopicDB (docType, scope, refId) {
    const reqParams = createPostFindParams(topicDatabase, docType, scope, refId);
    let dbResponse;
    try {
        dbResponse = await client.postFind(reqParams);
        // console.log(dbResponse);
    } catch (e) {
        return msgFromSDKError(e);
    }
    let funcResponse = {docType: docType, scope: scope, scopeRefId: refId, docs: dbResponse.result.docs};
    return new Promise(resolve => {
        resolve(funcResponse);
    });
}
async function getExercisesAndMaterialsByScopeAndRefIdFromTopicDB(scope, refId) {
    let reqParams = {
        db: topicDatabase,
        selector: {
            docType: {
                '$in': ['learningMaterial', 'exercise']
            }
        }
    }
    if (scope === 'topic') {
        reqParams.selector.topicConfigId = refId;
    } else {
        reqParams.selector.learningModuleReferenceId = refId;
    }
    let dbRes;
    try {
        dbRes = await client.postFind(reqParams);
    } catch (e) {
        return msgFromSDKError(e);
    }
    let exercises = {docType: 'exercise', scope: scope, scopeRefId: refId, docs: [], customResponse: null};
    let materials = {docType: 'learningMaterial', scope: scope, scopeRefId: refId, docs: []};
    for (let i = 0; i < dbRes.result.docs.length; i++) {
        if( dbRes.result.docs[i].docType === 'exercise' ) {
            exercises.docs.push(dbRes.result.docs[i]);
        } else {
            materials.docs.push(dbRes.result.docs[i]);
        }
    }
    if ( exercises.docs.length > 0 ) {
        const optionTitle = '<b>You can select an exercise or return to the topic from the options below:</b>';
        const labelField = 'name';
        const valueField = '_id';
        const valuePrefix = 'do exercise ';
        // exercises.customResponse = createCustomOptions(exercises.docs, optionTitle, labelField, valueField, valuePrefix);
        const moduleExercises = createCustomOptions(exercises.docs, optionTitle, labelField, valueField, valuePrefix);
        const additionalOptions = [
            {label: 'Back to topic', value: 'back to topic'}
        ];
        exercises.customResponse = addOptionsToCustomOptions(moduleExercises, additionalOptions, 'label', 'value');
    }
    let funcResponse = {docType: 'material+exercise', scope: scope, scopeRefId: refId, results: [materials, exercises]};
    return new Promise( resolve => {
        resolve(funcResponse);
    });
}

async function createUserBasicInfoByUserIdAndUsername(userId, username) {
    const doc = {
        _id: `${userId}:userBasicInfo`,
        docType: 'userBasicInfo',
        userId: userId,
        username: username,
        createdAt: Date.now()
    };
    const params = {
        db: userProfileDatabase,
        document: doc
    };
    let dbRes;
    try {
        dbRes = await client.postDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function getUserBasicInfoByUserId(userId) {
    let params = {
        db: userProfileDatabase,
        docId: `${userId}:userBasicInfo`
    }
    let dbRes;
    try {
        dbRes = await client.getDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function updateUserProfileDocument(doc) {
    const docValidation = validateDocForUpdate(doc);
    if (!docValidation.isValid) {
        return customErrorMsg(docValidation.reason, 400);
    }
    let params = {
        db: userProfileDatabase,
        document: doc
    };
    let dbRes;
    try {
        dbRes = await client.postDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({result: dbRes.result}));
}

async function createUserSessionInfo(userId, sessionId, sessionStartedAt) {
    const doc = {
        _id: `${userId}-session:${sessionStartedAt}`,
        docType: 'userSessionInfo',
        sessionId: sessionId,
        userBasicInfoId: `${userId}:userBasicInfo`,
        createdAt: sessionStartedAt
    };
    const params = {
        db: userProfileDatabase,
        document: doc
    };
    let dbRes;
    try {
        dbRes = await client.postDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function getLastSessionInfoExcludingSessionId(userId, sessionId) {
    const params = {
        db: userProfileDatabase,
        partitionKey: `${userId}-session`,
        selector: {
            $not: {
                sessionId: sessionId,
            }
        },
        sort:[ { createdAt: 'desc' } ],
        limit: 1
    };
    let dbRes;
    try {
        dbRes = await client.postPartitionFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function getLastSessionInfoInUserLocalTimeExcludingSessionId(userId, sessionId, userLanguage, userTimezone) {
    const params = {
        db: userProfileDatabase,
        partitionKey: `${userId}-session`,
        selector: {
            $not: {
                sessionId: sessionId,
            }
        },
        sort:[ { createdAt: 'desc' } ],
        limit: 1
    };
    let dbRes;
    try {
        dbRes = await client.postPartitionFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    if ( dbRes.result.docs.length > 0 ) {
        for ( let i = 0; i < dbRes.result.docs.length; i++ ) {
            if ( dbRes.result.docs[i].createdAt ) {
                const date = new Date(dbRes.result.docs[i].createdAt);
                if ( !!date ) {
                    dbRes.result.docs[i].createdAtUserLocalTime = date.toLocaleString(userLanguage, {timeZone: userTimezone});
                }
            }
        }
    }
    return new Promise(resolve => resolve({ result: dbRes.result }));
}


async function createSessionEvent(userId, sessionId, sessionEventTypeId, context, userExerciseInfoId, questionId, userInput) {
    const createAt = Date.now();
    const doc = {
        _id: `${userId}-${sessionId}-sessionEvent:${createAt}`,
        docType: 'userSessionEventLog',
        userId: userId,
        sessionId: sessionId,
        sessionEventTypeId: sessionEventTypeId,
        eventContext: context ? context : null,
        userExerciseInfoId: userExerciseInfoId ? userExerciseInfoId : null,
        questionId: questionId ? questionId : null,
        userInput: userInput ? userInput : null,
        createdAt: createAt
    };
    const params = {
        db: userSessionEventDatabase,
        document: doc
    };
    let dbRes;
    try {
        dbRes = await client.postDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    // return new Promise(resolve => resolve(dbRes));
    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function createUserExerciseInfo(userBasicInfoId, userSessionInfoId, exerciseId, exerciseName, learningModuleRefId, learningModuleName, topicConfigId, topicName, createdAt) {
    const userId = userBasicInfoId.split(":")[0];
    const doc = {
        _id: `${userId}-exerciseInfo:${createdAt}`,
        docType: 'userExerciseInfo',
        userBasicInfoId: userBasicInfoId,
        userSessionInfoId: userSessionInfoId,
        exerciseId: exerciseId,
        exerciseName: exerciseName,
        learningModuleRefId: learningModuleRefId,
        learningModuleName: learningModuleName,
        topicConfigId: topicConfigId,
        topicName: topicName,
        createdAt: createdAt,
        isCompleted: false,
        completedAt: null
    }
    const params = {
        db: userProfileDatabase,
        document: doc
    }
    let dbRes;
    try {
        dbRes = await client.postDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function setIsCompletedTrueToUserExerciseInfo(docId, completedAt) {
    let params = {
        db: userProfileDatabase,
        docId: docId
    };
    let dbRes;
    try {
        dbRes = await client.getDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    dbRes.result.isCompleted = true;
    dbRes.result.completedAt = completedAt;
    params = {
        db: userProfileDatabase,
        document: dbRes.result
    }
    try {
        dbRes = await client.postDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({ result: dbRes.result }) );
}

async function getUserExerciseInfosByUserSessionInfoId( userSessionInfoId ) {
    const userId = userSessionInfoId.split('-session:')[0];
    const params = {
        db: userProfileDatabase,
        partitionKey: `${userId}-exerciseInfo`,
        selector: {
            userSessionInfoId: userSessionInfoId
        },
    };
    let dbRes;
    try {
        dbRes = await client.postPartitionFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({ result: dbRes.result }));

}

async function categorizeUserExerciseInfoArray(docs) {
    const result = {
        completedUserExerciseInfos: [],
        incompleteUserExerciseInfos: [],
        customResponse: null
    };
    for ( let i = 0; i < docs.length; i++ ) {
        if ( docs[i].isCompleted ) {
            result.completedUserExerciseInfos.push(docs[i]);
        } else {
            let exerciseId = docs[i].exerciseId;
            if (docs.findIndex(doc => { return doc.exerciseId === exerciseId && doc.isCompleted }) === -1) {
                docs[i].topicAndExerciseName = `${docs[i].topicName} > ${docs[i].exerciseName}`;
                result.incompleteUserExerciseInfos.push(docs[i]);
            }
        }
    }
    if ( result.incompleteUserExerciseInfos.length > 0 ) {
        const optionTitle = result.incompleteUserExerciseInfos.length === 1 ? 'You can click on the exercise name to resume:' : 'Below is the list of incomplete exercises from the last session in chronical order, you can choose one to resume:';
        const optionLabel = 'topicAndExerciseName';
        const optionValue = '_id';
        result.customResponse = createCustomOptions(result.incompleteUserExerciseInfos, optionTitle, optionLabel, optionValue);
    }
    return new Promise(resolve => resolve({ result: result }));
}

async function getCategorizedUserExerciseInfos( userSessionInfoId ) {
    const userExerciseInfos = await getUserExerciseInfosByUserSessionInfoId(userSessionInfoId);
    if (userExerciseInfos.hasOwnProperty('errMsg')) {
        return Promise.resolve(userExerciseInfos);
    }
    const categorizedUserExerciseInfos = await categorizeUserExerciseInfoArray(userExerciseInfos.result.docs);
    return new Promise(resolve => resolve(categorizedUserExerciseInfos));
}

async function getLatestDoExerciseEventLog(userId, sessionId, sessionEventTypeId, userExerciseInfoId) {
    const partitionKey = `${userId}-${sessionId}-sessionEvent`;
    const selector = {
        sessionEventTypeId: sessionEventTypeId,
        userExerciseInfoId: userExerciseInfoId
    };
    const params = {
        db: userSessionEventDatabase,
        partitionKey: partitionKey,
        selector: selector,
        sort: [{'createdAt': 'desc'}],
        limit: 1
    }
    let dbRes;
    try {
        dbRes = await client.postPartitionFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({ result: dbRes.result }) );
}

async function getLatestActiveSurvey(surveyType) {
    const partitionKey = `chatlearn-${surveyType}`;
    const selector = {
        isActive: true,
    };
    const params = {
        db: topicDatabase,
        partitionKey: partitionKey,
        selector: selector,
        limit: 1
    }
    let dbRes;
    try {
        dbRes = await client.postPartitionFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    if (dbRes.result.docs.length > 0) {
        for(let i = 0; i < dbRes.result.docs[0].sections.length; i++) {
            for(let j = 0; j < dbRes.result.docs[0].sections[i].questions.length; j++) {
                if (dbRes.result.docs[0].sections[i].questions[j].questionType === 'singleSelect') {
                    const optionTitle = dbRes.result.docs[0].sections[i].questions[j].optionHeader;
                    const labelField = 'label';
                    const valueField = 'value';
                    const valuePrefix = null;
                    dbRes.result.docs[0].sections[i].questions[j].customResponse =
                        createCustomOptions(
                            dbRes.result.docs[0].sections[i].questions[j].options,
                            optionTitle,
                            labelField,
                            valueField,
                            valuePrefix);
                }
            }
        }
    }
    return new Promise(resolve => resolve({'result': dbRes.result}))
}

async function getLatestActiveSurveyByOrgIdAndSurveyType(orgId, surveyType) {
    const partitionKey = `${orgId}-${surveyType}`;
    const selector = {
        isActive: true,
    };
    const params = {
        db: topicDatabase,
        partitionKey: partitionKey,
        selector: selector,
        limit: 1
    }
    let dbRes;
    try {
        dbRes = await client.postPartitionFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    if (dbRes.result.docs.length > 0) {
        for(let i = 0; i < dbRes.result.docs[0].sections.length; i++) {
            for(let j = 0; j < dbRes.result.docs[0].sections[i].questions.length; j++) {
                if (dbRes.result.docs[0].sections[i].questions[j].questionType === 'singleSelect') {
                    const optionTitle = dbRes.result.docs[0].sections[i].questions[j].optionHeader;
                    const labelField = 'label';
                    const valueField = 'value';
                    const valuePrefix = null;
                    dbRes.result.docs[0].sections[i].questions[j].customResponse =
                        createCustomOptions(
                            dbRes.result.docs[0].sections[i].questions[j].options,
                            optionTitle,
                            labelField,
                            valueField,
                            valuePrefix);
                }
            }
        }
    }
    return new Promise(resolve => resolve({'result': dbRes.result}))
}

async function createUserSurvey(userBasicInfoId, surveyId, surveyName, surveyType) {
    const userId = userBasicInfoId.split(":")[0];
    const createdAt = Date.now();
    const doc = {
        _id: `${userId}-${surveyType}:${createdAt}`,
        docType: 'userSurvey',
        userBasicInfoId: userBasicInfoId,
        surveyId: surveyId,
        surveyName: surveyName,
        surveyType: surveyType,
        isCompleted: false,
        createdAt: createdAt,
        updatedAt: null
    };
    const params = {
        db: userProfileDatabase,
        document: doc
    };
    let dbRes;
    try {
        dbRes = await client.postDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function getDocumentByDbNameAndDocId(dbName, docId) {
    const params = {
        db: dbName,
        docId: docId
    };
    let dbRes;
    try {
        dbRes = await client.getDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function createUserSurveyAnswer(userBasicInfoId, userSurveyId, surveyId, surveySectionId, surveySectionName,
                                      questionId, questionType, questionDescription, expectedValueType, isSA, value) {
    const partitionKey = userSurveyId.split(":")[0];
    const createdAt = Date.now();
    const doc = {
        _id: `${partitionKey}:${createdAt}`,
        docType: 'userSurveyAnswer',
        userBasicInfoId: userBasicInfoId,
        userSurveyId: userSurveyId,
        surveyId: surveyId,
        surveySectionRefId: surveySectionId,
        surveySectionName: surveySectionName,
        surveyQuestionRefId: questionId,
        surveyQuestionType: questionType,
        surveyQuestionDescription: questionDescription,
        expectedValueType: expectedValueType,
        isSelfAssessment: isSA,
        value: value,
        createdAt: createdAt,
        updatedAt: null
    };
    const params = {
        db: userProfileDatabase,
        document: doc
    };
    let dbRes;
    try {
        dbRes = await client.postDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({result: dbRes.result}))
}

async function updateMultipleDocuments(dbName, docs) {
    const params = {
        db: dbName,
        bulkDocs: {'docs': docs }
    };
    let dbRes;
    try {
        dbRes = await client.postBulkDocs(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function postPartitionFind(dbName, partitionKey, selector, sort, limit) {
    let params = {
        db: dbName,
        partitionKey: partitionKey,
        selector: selector
    };
    if (sort) {
        params.sort = sort;
    }
    if (limit) {
        params.limit = limit;
    }
    let dbRes;
    try {
        dbRes = await client.postPartitionFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({result: dbRes.result}));
}

async function analyzeSelfAssessmentsFromSurvey(surveyType, userBasicInfoId, isSurveyCompleted) {
    // get the last user survey
    const userId = userBasicInfoId.split(':')[0];
    let partitionKey = `${userId}-${surveyType}`;
    // let selector = {
    //     'docType': 'userSurvey',
    //     'surveyId': surveyId,
    //     'isCompleted': isSurveyCompleted
    // }
    let selector = {
        'docType': 'userSurvey',
        'surveyType': surveyType,
        'isCompleted': isSurveyCompleted
    }
    let lastUserSurvey;
    try {
        lastUserSurvey = await client.postPartitionFind({
            db: userProfileDatabase,
            partitionKey: partitionKey,
            selector: selector,
            sort: [{'createdAt': 'desc'}],
            limit: 1,
        });
    } catch (e) {
        return msgFromSDKError(e);
    }
    if ( lastUserSurvey.result.docs.length === 0 ) {
        return customErrorMsg('No user survey for the given surveyId and isCompleted params', 404);
    }

    // get the user survey answers regarding self-assessment
    let userSelfAssessments;
    selector = {
        'docType': 'userSurveyAnswer',
        'userSurveyId': lastUserSurvey.result.docs[0]._id,
        'isSelfAssessment': true,
        'createdAt': {'$gte': lastUserSurvey.result.docs[0].createdAt }
    };
    try {
        userSelfAssessments = await client.postPartitionFind({
            db: userProfileDatabase,
            partitionKey: partitionKey,
            selector: selector,
        });
    } catch (e) {
        return msgFromSDKError(e);
    }
    if ( userSelfAssessments.result.docs.length === 0 ) {
        return customErrorMsg('No self assessments in the given survey', 404);
    }

    // arrange the self assessments by topic
    const topicsArr = [];
    for ( let i = 0; i < userSelfAssessments.result.docs.length; i++ ) {
        let qRefIdSplitArr = userSelfAssessments.result.docs[i].surveyQuestionRefId.split(':');
        let tConfigId = `${qRefIdSplitArr[0]}:topicConfig`;
        let moduleRefId = `${qRefIdSplitArr[0]}:module-${qRefIdSplitArr[2].split('.')[0]}`;
        const topicIndex = topicsArr.findIndex(t => t.topicConfigId === tConfigId);
        if ( topicIndex === -1 ) {
            let topicAssessment = {
                topicConfigId: tConfigId,
                unsortedSelfAssessments: [{
                    'moduleRefId': moduleRefId,
                    'SASId': userSelfAssessments.result.docs[i].surveyQuestionRefId,
                    'value': parseInt(userSelfAssessments.result.docs[i].value),
                    'SAS': userSelfAssessments.result.docs[i].surveyQuestionDescription
                }]
            };
            topicsArr.push(topicAssessment);
        } else {
            const sasIdIndex = topicsArr[topicIndex]
                .unsortedSelfAssessments.findIndex(s => s.SASId === userSelfAssessments.result.docs[i].surveyQuestionRefId);
            if (sasIdIndex === -1) {
                topicsArr[topicIndex].unsortedSelfAssessments.push({
                    'moduleRefId': moduleRefId,
                    'SASId': userSelfAssessments.result.docs[i].surveyQuestionRefId,
                    'value': parseInt(userSelfAssessments.result.docs[i].value),
                    'SAS': userSelfAssessments.result.docs[i].surveyQuestionDescription
                });
            } else {
                topicsArr[topicIndex].unsortedSelfAssessments[sasIdIndex].value = parseInt(userSelfAssessments.result.docs[i].value);
            }
        }
    }

    // order the self assessments by value in ascending order, get min, max, and median
    for ( let i = 0; i < topicsArr.length; i++ ) {
        topicsArr[i].sortedSelfAssessments = JSON.parse(JSON.stringify(topicsArr[i].unsortedSelfAssessments));
        topicsArr[i].sortedSelfAssessments.sort((a, b) => a.value - b.value);
        let assessmentArrLength = topicsArr[i].sortedSelfAssessments.length;
        topicsArr[i].minValue = topicsArr[i].sortedSelfAssessments[0].value;
        topicsArr[i].maxValue = topicsArr[i].sortedSelfAssessments[assessmentArrLength - 1].value;
        if ( assessmentArrLength % 2 === 0 ) {
            topicsArr[i].medianValue = ( topicsArr[i].sortedSelfAssessments[assessmentArrLength / 2 - 1].value +
                topicsArr[i].sortedSelfAssessments[assessmentArrLength / 2].value ) / 2;
        } else {
            topicsArr[i].medianValue = topicsArr[i].sortedSelfAssessments[(assessmentArrLength + 1) / 2 - 1].value;
        }
    }

    // order the topics array by median
    topicsArr.sort((a, b) => a.medianValue - b.medianValue );

    // add timestamp
    const result = {
        'createdAt': Date.now(),
        'sortedTopicsArr': topicsArr
    };

    // return the analyzed result
    return new Promise(resolve => resolve({result: result}))
}

async function getCompletedExerciseInfosByLearningModuleName(userBasicInfoId, topicConfigId, moduleName) {
    const partitionKey = `${userBasicInfoId.split(':')[0]}-exerciseInfo`;
    const selector = {
        'docType': 'userExerciseInfo',
        'topicConfigId': topicConfigId,
        'learningModuleName': moduleName,
        'userBasicInfoId': userBasicInfoId,
        'isCompleted': true
    };
    const fields = ['_id', 'learningModuleRefId', 'exerciseId', 'isCompleted'];
    const params = {
        db: userProfileDatabase,
        partitionKey: partitionKey,
        selector: selector,
        fields: fields
    };
    let dbRes;
    try {
        dbRes = await client.postPartitionFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    // console.log(dbRes);

    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function getExerciseIdsAndNamesByModuleRefId(moduleRefId) {
    const fields = ['_id', 'name'];
    const partitionKey = moduleRefId.split(':')[0];
    const selector = {
        'docType': 'exercise',
        'learningModuleReferenceId': moduleRefId,
        'topicConfigId': partitionKey + ':topicConfig'
    };
    const params = {
        db: topicDatabase,
        partitionKey: partitionKey,
        selector: selector,
        fields: fields
    };
    let dbRes;
    try {
        dbRes = await client.postPartitionFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    // console.log(dbRes);

    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function checkHasUserCompletedModuleExercises(userBasicInfoId, topicConfigId, moduleRefId, moduleName) {
    const moduleExerciseIds = await getExerciseIdsAndNamesByModuleRefId(moduleRefId);
    if ( moduleExerciseIds.hasOwnProperty('errMsg')) {
        return customErrorMsg(moduleExerciseIds.errMsg, moduleExerciseIds.httpStatus);
    }
    // console.log(moduleExerciseIds);
    const completedModuleExercises = await getCompletedExerciseInfosByLearningModuleName(userBasicInfoId, topicConfigId, moduleName);
    if ( completedModuleExercises.hasOwnProperty('errMsg') ) {
        return customErrorMsg(completedModuleExercises.errMsg, completedModuleExercises.httpStatus);
    }
    // console.log(completedModuleExercises);
    let res = {
        userBasicInfoId: userBasicInfoId,
        topicConfigId: topicConfigId,
        moduleRefId: moduleRefId,
        moduleName: moduleName,
        userHasCompletedModuleExercises: true,
        userHasCompletedTheLastExercise: true,
        incompleteExerciseIds: [],
        customResponse: null
    };
    for ( let i = 0; i < moduleExerciseIds.result.docs.length; i++ ) {
        const findIndex = completedModuleExercises.result.docs.findIndex(e => e.exerciseId === moduleExerciseIds.result.docs[i]._id);
        if ( findIndex === -1 ) {
            res.userHasCompletedModuleExercises = false;
            res.incompleteExerciseIds.push({id: moduleExerciseIds.result.docs[i]._id, name: moduleExerciseIds.result.docs[i].name});
            if (i === ( moduleExerciseIds.result.docs.length - 1 )) {
                res.userHasCompletedTheLastExercise = false;
            }
        }
    }
    if ( res.incompleteExerciseIds.length > 0 ) {
        res.customResponse = createCustomOptions(
            res.incompleteExerciseIds,
            '<b>You can validate your assessment by doing an exercise below:</b>',
            'name',
            'id',
            null);
    }
    return new Promise(resolve => resolve({ result: res }));
}

async function createCustomOptionsFromKeyValueArr(arr, optionTitle, isTitleBold, labelField, valueField, valuePrefix) {
    let result = { customResponse: null };
    if ( isTitleBold ) {
        result.customResponse = createCustomOptions(
            arr,
            `<b>${optionTitle}</b>`,
            labelField,
            valueField,
            valuePrefix
        );
    } else {
        result.customResponse = createCustomOptions(
            arr,
            `${optionTitle}`,
            labelField,
            valueField,
            valuePrefix
        );
    }

    return new Promise(resolve => resolve({ result: result }));
}
async function updateUserSelfAssessmentSummary(userBasicInfoId, SASId, SAS, value, sourceId){
    const userSASummaryId = `${userBasicInfoId.split(':')[0]}:userSelfAssessmentSummary`;
    let params = { db: userProfileDatabase, docId: userSASummaryId };
    let dbRes;
    try {
        dbRes = await client.getDocument(params);
    } catch (e) {
        if ( e.status !== 404 ) {
            return msgFromSDKError(e);
        }
    }
    let userSASummary;
    const userAssessment = {
        SASId: SASId,
        SAS: SAS,
        value: value,
        sourceId: sourceId
    };
    if ( !dbRes ) {
        userSASummary = {
            _id: userSASummaryId,
            docType: 'userSelfAssessmentSummary',
            userBasicInfoId: userBasicInfoId,
            userAssessments: [ userAssessment ],
            createdAt: Date.now(),
            updatedAt: null
        };
    } else {
        userSASummary = dbRes.result;
        let index = userSASummary.userAssessments.findIndex( ua => ua.SASId === userAssessment.SASId );
        if ( index === -1 ) {
            userSASummary.userAssessments.push( userAssessment );
        } else {
            userSASummary.userAssessments[index].SAS = userAssessment.SAS;
            userSASummary.userAssessments[index].value = userAssessment.value;
            userSASummary.userAssessments[index].sourceId = userAssessment.sourceId;
            // userSASummary.updatedAt = Date.now();
        }
        userSASummary.updatedAt = Date.now();
    }
    userSASummary.userAssessments.sort((a, b) => {
        if ( a.SASId < b.SASId ) {
            return -1;
        }
        if ( a.SASId > b.SASId ) {
            return 1;
        }
        return 0;
    });
    params = { db: userProfileDatabase, document: userSASummary };
    try {
        dbRes = await client.postDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function createUserSurveyAnswerAndUpdateUserSurveySummary(
    userBasicInfoId, userSurveyId, surveyId, surveySectionId, surveySectionName,
    questionId, questionType, questionDescription, expectedValueType, isSA, value){
    const createSurveyAnswerResult = await createUserSurveyAnswer(
        userBasicInfoId, userSurveyId, surveyId, surveySectionId, surveySectionName,
        questionId, questionType, questionDescription, expectedValueType, isSA, value);
    if (createSurveyAnswerResult.hasOwnProperty('errMsg') || !isSA) {
        return createSurveyAnswerResult;
    }
    return updateUserSelfAssessmentSummary(
        userBasicInfoId, questionId, questionDescription, value, createSurveyAnswerResult.result.id
    );

}

async function analyzeSelfAssessmentsFromUserSASummary(userBasicInfoId) {
    // get user SA summary
    const userId = userBasicInfoId.split(':')[0];
    let docId = `${userId}:userSelfAssessmentSummary`;
    let userSASummary;
    try {
        userSASummary = await client.getDocument({
            db: userProfileDatabase,
            docId: docId
        });
    } catch (e) {
        return msgFromSDKError(e);
    }
    if ( userSASummary.result.userAssessments.length === 0 ) {
        return customErrorMsg('No user assessments in the user assessment summary', 404);
    }

    // arrange the self assessments by topic
    const topicsArr = [];
    for ( let i = 0; i < userSASummary.result.userAssessments.length; i++ ) {
        let qRefIdSplitArr = userSASummary.result.userAssessments[i].SASId.split(':');
        let tConfigId = `${qRefIdSplitArr[0]}:topicConfig`;
        let moduleRefId = `${qRefIdSplitArr[0]}:module-${qRefIdSplitArr[2].split('.')[0]}`;
        const topicIndex = topicsArr.findIndex(t => t.topicConfigId === tConfigId);
        if ( topicIndex === -1 ) {
            let topicAssessment = {
                topicConfigId: tConfigId,
                unsortedSelfAssessments: [{
                    'moduleRefId': moduleRefId,
                    'SASId': userSASummary.result.userAssessments[i].SASId,
                    'value': parseInt(userSASummary.result.userAssessments[i].value),
                    'SAS': userSASummary.result.userAssessments[i].SAS
                }]
            };
            topicsArr.push(topicAssessment);
        } else {
            const sasIdIndex = topicsArr[topicIndex]
                .unsortedSelfAssessments.findIndex(s => s.SASId === userSASummary.result.userAssessments[i].SASId);
            if (sasIdIndex === -1) {
                topicsArr[topicIndex].unsortedSelfAssessments.push({
                    'moduleRefId': moduleRefId,
                    'SASId': userSASummary.result.userAssessments[i].SASId,
                    'value': parseInt(userSASummary.result.userAssessments[i].value),
                    'SAS': userSASummary.result.userAssessments[i].SAS
                });
            } else {
                topicsArr[topicIndex].unsortedSelfAssessments[sasIdIndex].value = parseInt(userSASummary.result.userAssessments[i].value);
            }
        }
    }

    // order the self assessments by value in ascending order, get min, max, and median
    for ( let i = 0; i < topicsArr.length; i++ ) {
        topicsArr[i].sortedSelfAssessments = JSON.parse(JSON.stringify(topicsArr[i].unsortedSelfAssessments));
        topicsArr[i].sortedSelfAssessments.sort((a, b) => a.value - b.value);
        let assessmentArrLength = topicsArr[i].sortedSelfAssessments.length;
        topicsArr[i].minValue = topicsArr[i].sortedSelfAssessments[0].value;
        topicsArr[i].maxValue = topicsArr[i].sortedSelfAssessments[assessmentArrLength - 1].value;
        if ( assessmentArrLength % 2 === 0 ) {
            topicsArr[i].medianValue = ( topicsArr[i].sortedSelfAssessments[assessmentArrLength / 2 - 1].value +
                topicsArr[i].sortedSelfAssessments[assessmentArrLength / 2].value ) / 2;
        } else {
            topicsArr[i].medianValue = topicsArr[i].sortedSelfAssessments[(assessmentArrLength + 1) / 2 - 1].value;
        }
    }

    // order the topics array by median
    topicsArr.sort((a, b) => a.medianValue - b.medianValue );

    // add timestamp
    const result = {
        'createdAt': Date.now(),
        'sortedTopicsArr': topicsArr
    };

    // return the analyzed result
    return new Promise(resolve => resolve({result: result}))
}

async function createUserSelfAssessment(userBasicInfoId, SASId, SAS, value, valueType, isLikertScale, likertPoints){
    const userId = userBasicInfoId.split(':')[0];
    const createdAt = Date.now();
    const userSelfAssessment = {
        _id: `${userId}-selfAssessment:${createdAt}`,
        docType: 'userSelfAssessment',
        userBasicInfoId: userBasicInfoId,
        SASId: SASId,
        SAS: SAS,
        value: value,
        valueType: valueType,
        isLikertScale: isLikertScale,
        likertPoints: likertPoints,
        createdAt: createdAt
    };
    const params = {
        db: userProfileDatabase,
        document: userSelfAssessment
    };
    let dbRes;
    try {
        dbRes = await client.postDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve(dbRes));
}

async function createUserFivePointLikertSelfAssessmentAndUpdateUserSASummary(
    userBasicInfoId, SASId, SAS, value) {
    const isLikert = true;
    const likertPoints = 5;
    const valueType = 'number';
    const createUserSAResult = await createUserSelfAssessment(
        userBasicInfoId, SASId, SAS, value,valueType, isLikert, likertPoints);
    if (createUserSAResult.hasOwnProperty('errMsg')) { return createUserSAResult; }
    return updateUserSelfAssessmentSummary(userBasicInfoId, SASId, SAS, value, createUserSAResult.result.id);
}

async function getActiveSASByTopicConfigId(topicConfigId, fields){
    const partitionKey = topicConfigId.split(':')[0];
    const selector = {
        docType: 'selfAssessmentStatement',
        isActive: true
    };
    let params = {
        db: topicDatabase,
        partitionKey: partitionKey,
        selector: selector,
    };
    if ( Array.isArray(fields) && fields.length > 0 ) {
        params.fields = fields;
    }
    let dbRes;
    try {
        dbRes = await client.postPartitionFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => {resolve({ result: dbRes.result })});
}

async function getActiveSASByPartKeyAndScopeAndScopeRefId(partKey, scope, scopeRefId, fields){
    const selector = {
        docType: 'selfAssessmentStatement',
        isActive: true,
        scope: scope,
        scopeRefId: scopeRefId
    };
    let params = {
        db: topicDatabase,
        partitionKey: partKey,
        selector: selector,
    };
    if ( Array.isArray(fields) && fields.length > 0 ) {
        params.fields = fields;
    }
    let dbRes;
    try {
        dbRes = await client.postPartitionFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => {resolve({ result: dbRes.result })});
}

async function analyzeCompletedTopicSelfAssessmentsFromUserSASummary(userBasicInfoId) {
    // get userSelfAssessmentSummary
    const userId = userBasicInfoId.split(':')[0];
    let docId = `${userId}:userSelfAssessmentSummary`;
    let userSASummary;
    try {
        userSASummary = await client.getDocument({
            db: userProfileDatabase,
            docId: docId
        });
    } catch (e) {
        // handle if there is no userSelfAssessmentSummary
        return msgFromSDKError(e);
    }
    // handle if there is no userAssessments
    if ( userSASummary.result.userAssessments.length === 0 ) {
        return customErrorMsg('No user assessments in the user assessment summary', 404);
    }
    // return userSASummary;
    // get all active selfAssessmentStatements and handle errors
    let activeSASs;
    try {
        activeSASs = await client.postFind( {
            db: topicDatabase,
            selector: {
                docType: 'selfAssessmentStatement',
                isActive: true
            },
            fields: ['_id', 'scopeRefId'],
            executionStats: true
        });
    } catch (e) {
        return msgFromSDKError(e);
    }
    if ( activeSASs.result.docs.length === 0 ) {
        return customErrorMsg('No active self-assessment statements', 404);
    }
    // return activeSASs;
    // check completed and incomplete topic assessments
    const topicsArr = [];
    for ( let i = 0; i < activeSASs.result.docs.length; i++ ) {
        // console.log(activeSASs.result.docs[i]._id);
        let SASIdSplitArr = activeSASs.result.docs[i]._id.split(':');
        let tConfigId = `${SASIdSplitArr[0]}:topicConfig`;
        let mRefId = `${SASIdSplitArr[0]}:module-${SASIdSplitArr[2].split('.')[0]}`;
        const topicsArrIndex = topicsArr.findIndex(t => t.topicConfigId === tConfigId);
        if ( topicsArrIndex === -1 ) {
            let topicAssessment = {
                topicConfigId: tConfigId,
                isAssessmentCompleted: true,
                unsortedSelfAssessments: []
            };
            const userSelfAssessmentIndex = userSASummary.result.userAssessments.findIndex(ua => ua.SASId === activeSASs.result.docs[i]._id);
            if ( userSelfAssessmentIndex === -1 ) {
                topicAssessment.isAssessmentCompleted = false;
            } else {
                topicAssessment.unsortedSelfAssessments.push({
                    'moduleRefId': mRefId,
                    'SASId': userSASummary.result.userAssessments[userSelfAssessmentIndex].SASId,
                    'value': parseInt(userSASummary.result.userAssessments[userSelfAssessmentIndex].value),
                    'SAS': userSASummary.result.userAssessments[userSelfAssessmentIndex].SAS
                });
            }
            topicsArr.push(topicAssessment);
        } else {
            const userSelfAssessmentIndex = userSASummary.result.userAssessments.findIndex(ua => ua.SASId === activeSASs.result.docs[i]._id);
            if ( userSelfAssessmentIndex === -1 ) {
                topicsArr[topicsArrIndex].isAssessmentCompleted = false;
            } else {
                topicsArr[topicsArrIndex].unsortedSelfAssessments.push({
                    'moduleRefId': mRefId,
                    'SASId': userSASummary.result.userAssessments[userSelfAssessmentIndex].SASId,
                    'value': parseInt(userSASummary.result.userAssessments[userSelfAssessmentIndex].value),
                    'SAS': userSASummary.result.userAssessments[userSelfAssessmentIndex].SAS
                });
            }
        }
    }
    const completedAssessedTopics = topicsArr.filter(t => t.isAssessmentCompleted);
    // console.log(completedAssessedTopics.length);
    let result = {
        'createdAt': Date.now(),
        'sortedTopicsArr': null,
        'incompleteAssessedTopics': topicsArr.filter(t => t.isAssessmentCompleted === false)
    }
    if ( completedAssessedTopics.length === 0 ) {
        return new Promise(resolve => resolve({result: result}))
    }
    // analyze completed topic assessments
    for ( let i = 0; i < completedAssessedTopics.length; i++ ) {
        completedAssessedTopics[i].sortedSelfAssessments = JSON.parse(JSON.stringify(completedAssessedTopics[i].unsortedSelfAssessments));
        completedAssessedTopics[i].sortedSelfAssessments.sort((a, b) => a.value - b.value);
        let assessmentArrLength = completedAssessedTopics[i].sortedSelfAssessments.length;
        completedAssessedTopics[i].minValue = completedAssessedTopics[i].sortedSelfAssessments[0].value;
        completedAssessedTopics[i].maxValue = completedAssessedTopics[i].sortedSelfAssessments[assessmentArrLength - 1].value;
        if ( assessmentArrLength % 2 === 0 ) {
            completedAssessedTopics[i].medianValue = ( completedAssessedTopics[i].sortedSelfAssessments[assessmentArrLength / 2 - 1].value +
                completedAssessedTopics[i].sortedSelfAssessments[assessmentArrLength / 2].value ) / 2;
        } else {
            completedAssessedTopics[i].medianValue = completedAssessedTopics[i].sortedSelfAssessments[(assessmentArrLength + 1) / 2 - 1].value;
        }
    }

    // order the topics array by median
    completedAssessedTopics.sort((a, b) => a.medianValue - b.medianValue );
    result.sortedTopicsArr = completedAssessedTopics;

    // return analyzed result
    return new Promise(resolve => resolve({result: result}))
}

async function getAllExercisesWithGivenFields(fields){
    const selector = {
        'docType': 'exercise',
        'topicConfigId': {'$ne': null}
    };
    const params = {
        db: topicDatabase,
        selector: selector,
        fields: fields,
        executionStats: true
    };
    let dbRes;
    try {
        dbRes = await client.postFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    // console.log(dbRes.result);
    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function getCompletedExercisesByUserWithGivenFields(userBasicInfoId, fields) {
    const partitionKey = `${userBasicInfoId.split(':')[0]}-exerciseInfo`;
    const selector = {
        'isCompleted': true
    };
    const params = {
        db: userProfileDatabase,
        partitionKey: partitionKey,
        selector: selector,
        fields: fields,
        executionStats: true
    };
    let dbRes;
    try {
        dbRes = await client.postPartitionFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    // console.log(dbRes.result);
    return new Promise(resolve => resolve({ result: dbRes.result }));
}

async function getExerciseSummary(userBasicInfoId) {
    // get all exercise meta info and completed exercises of a given user
    const exerciseFields = ['_id', 'name', 'topicConfigId'];
    const userExerciseInfoFields = ['exerciseId'];
    let promises;
    try {
        promises = await Promise.all([
            getAllExercisesWithGivenFields(exerciseFields),
            getCompletedExercisesByUserWithGivenFields(userBasicInfoId, userExerciseInfoFields)
        ]);
    }  catch (e) {
        return msgFromSDKError(e);
    }
    // upstream error handling
    let hasUpstreamErrMsg = false;
    let upstreamErrMsgs = [];
    for ( let i = 0; i < promises.length; i++ ) {
        if ( promises[i].hasOwnProperty('errMsg') ) {
            hasUpstreamErrMsg = true;
            upstreamErrMsgs.push(promises[i].errMsg);
        }
    }
    if ( hasUpstreamErrMsg ) {
        let errMsg = 'Got upstream function error ' + upstreamErrMsgs.join(', ');
        return customErrorMsg(errMsg, 500);
    }
    if ( promises[0].result.docs.length === 0 ) {
        return customErrorMsg('There is no exercise in the topic database', 404);
    }
    // create and return a summary about completed and incomplete exercises by topic for the given user
    let totalSummary = [];
    let tId = null;
    for ( let i = 0; i < promises[0].result.docs.length; i++ ) {
        let exerciseMeta = {
            exerciseId: promises[0].result.docs[i]._id,
            exerciseName: promises[0].result.docs[i].name
        };
        if ( promises[0].result.docs[i].topicConfigId === tId ) {
            // check if the user has done the exercise
            if (promises[1].result.docs.some(d => d.exerciseId === exerciseMeta.exerciseId)) {
                totalSummary[totalSummary.length - 1].completedExercises.push(exerciseMeta);
            } else {
                totalSummary[totalSummary.length - 1].incompleteExercises.push(exerciseMeta);
            }
        } else {
            let topicExerciseSummary = {
                topicConfigId: promises[0].result.docs[i].topicConfigId,
                completedExercises: [],
                incompleteExercises: []
            };
            // check if the user has done the exercise
            if (promises[1].result.docs.some(d => d.exerciseId === exerciseMeta.exerciseId)) {
                topicExerciseSummary.completedExercises.push(exerciseMeta);
            } else {
                topicExerciseSummary.incompleteExercises.push(exerciseMeta);
            }
            totalSummary.push(topicExerciseSummary);
            tId = promises[0].result.docs[i].topicConfigId;
        }
    }
    const result = { createdAt: Date.now(), exerciseSummary: totalSummary };
    return new Promise(resolve => resolve({ result: result }));
}

async function getLastCompletedExerciseInfoByUserBasicInfoId(userBasicInfoId, fields) {
    const exerciseInfoPartKey = `${userBasicInfoId.split(':')[0]}-exerciseInfo`;
    const selector = {
        'docType': 'userExerciseInfo',
        'isCompleted': true
    };
    let params = {
        db: userProfileDatabase,
        partitionKey: exerciseInfoPartKey,
        selector: selector,
        sort: [{'createdAt':'desc'}],
        limit: 1,
        executionStats: true
    };
    if (Array.isArray(fields) && fields.length > 0) {
        params.fields = fields;
    }
    let dbRes;
    try {
        dbRes = await client.postPartitionFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({result: dbRes.result}));
}

async function getAllTopicConfigIdsAndNames(){
    const params = {
        db: topicDatabase,
        selector: {
            docType: 'topicConfig'
        },
        fields: ['_id', 'name'],
        executionStats: true
    };
    let dbRes;
    try {
        dbRes = await client.postFind(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    // console.log(dbRes.result);
    return new Promise(resolve => resolve({result: dbRes.result}));
}

async function createCustomOptionsForTopicsWithIncompleteExercises(userBasicInfoId, userExerciseSummary) {
    // if there is a user exercise summary, check if it is obsolete
    let summary = userExerciseSummary;
    let userLastCompletedExercise;
    let isSummaryObsolete = false;
    if (summary) {
        userLastCompletedExercise = await getLastCompletedExerciseInfoByUserBasicInfoId(userBasicInfoId, ['completedAt']);
    }
    if (userLastCompletedExercise && userLastCompletedExercise.hasOwnProperty('errMsg')) {
        return userLastCompletedExercise;
    }
    if (summary && userLastCompletedExercise && userLastCompletedExercise.result.docs.length > 0 ) {
        if (summary.result.createdAt < userLastCompletedExercise.result.docs[0].completedAt) {
            isSummaryObsolete = true;
        }
    }
    // if there is no user exercise summary or it is obsolete, get user exercise summary
    if (!summary || isSummaryObsolete) {
        summary = await getExerciseSummary(userBasicInfoId);
        if (summary.hasOwnProperty('errMsg')) {
            return summary;
        }
    }
    if (!summary.result.exerciseSummary[0].topicName) {
        const topicIdsAndNames = await getAllTopicConfigIdsAndNames();
        if (topicIdsAndNames.hasOwnProperty('errMsg')) {
            return topicIdsAndNames;
        }
        for (let i = 0; i < summary.result.exerciseSummary.length; i++ ) {
            let topic = topicIdsAndNames.result.docs.find(t => t._id === summary.result.exerciseSummary[i].topicConfigId);
            let completedExerciseCount = summary.result.exerciseSummary[i].completedExercises.length;
            let totalExerciseCount = completedExerciseCount + summary.result.exerciseSummary[i].incompleteExercises.length;
            summary.result.exerciseSummary[i].topicName = topic.name + ` (${completedExerciseCount}/${totalExerciseCount})`;
        }
    }
    // add progress postfix if it has not been added
    let progressPostfix = /\(\d*\/\d*\)$/g;
    if (!progressPostfix.test(summary.result.exerciseSummary[0].topicName)) {
        for (let i = 0; i < summary.result.exerciseSummary.length; i++ ) {
            let completedExerciseCount = summary.result.exerciseSummary[i].completedExercises.length;
            let totalExerciseCount = completedExerciseCount + summary.result.exerciseSummary[i].incompleteExercises.length;
            summary.result.exerciseSummary[i].topicName = summary.result.exerciseSummary[i].topicName + ` (${completedExerciseCount}/${totalExerciseCount})`;
        }
    }
    summary = summary.result.exerciseSummary.filter(t => t.incompleteExercises.length > 0);
    // console.log(summary);
    // create topic and exercise options
    let customOptions = {
        hasIncompleteExercises: true,
        incompleteTopicOptions: null,
        incompleteExerciseOptionsByTopic: [],
        createdAt: Date.now()
    }
    if (summary.length === 0) {
        customOptions.hasIncompleteExercises = false;
        return new Promise(resolve => resolve({result: customOptions}));
    }
    let title = 'First, please select a topic with incomplete exercise(s):'
    let funcRes = await createCustomOptionsFromKeyValueArr(summary, title, true, 'topicName', 'topicConfigId', null);
    customOptions.incompleteTopicOptions = funcRes.result;
    for (let i = 0; i < summary.length; i++) {
        // console.log(summary[i]);
        title = 'Now, please select an incomplete exercise:'
        let exerciseOptionsByTopic = {
            topicConfigId: summary[i].topicConfigId,
            topicName: summary[i].topicName,
            exerciseOptions: {}
        };
        funcRes = await createCustomOptionsFromKeyValueArr(summary[i].incompleteExercises, title, true, 'exerciseName', 'exerciseId', null)
        // console.log(funcRes);
        exerciseOptionsByTopic.exerciseOptions = funcRes.result;
        customOptions.incompleteExerciseOptionsByTopic.push(exerciseOptionsByTopic);
    }

    return new Promise(resolve => resolve({result: customOptions}));
}

async function createAnonymousFeedback(category, feedback) {
    const timestamp = Date.now();
    const camelCaseCategory = category.split(' ').map(function(word, index) {
        if (index === 0) { return word.toLowerCase(); }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join('');
    const doc = {
        _id: `${camelCaseCategory}:${timestamp}`,
        docType: 'anonymousFeedback',
        category: category,
        description: feedback,
        createdAt: timestamp
    };
    const params = {
        db: feedbackDatabase,
        document: doc
    };
    let dbRes;
    try {
        dbRes = await client.postDocument(params);
    } catch (e) {
        return msgFromSDKError(e);
    }
    return new Promise(resolve => resolve({ result: dbRes.result }));
}
module.exports = { main };

