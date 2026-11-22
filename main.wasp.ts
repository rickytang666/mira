import { app, page, route, action, query, job, api } from "@wasp.sh/spec";
import { NewStudyPage } from "./src/study/NewStudyPage" with { type: "ref" };
import { KnowledgePage } from "./src/study/KnowledgePage" with { type: "ref" };
import { QuestionnairePage } from "./src/study/QuestionnairePage" with { type: "ref" };
import { ReportPage } from "./src/report/ReportPage" with { type: "ref" };
import { importWebsite, importMcp } from "./src/sources" with { type: "ref" };
import { createStudy, getStudies, getStudy, updateStudy, setStudyLogo, addSource, deleteSource, getPublicStudy, finishInterview, getReport, generateStudyQuestions } from "./src/study/operations" with { type: "ref" };
import { processInterview } from "./src/jobs/processInterview" with { type: "ref" };
import { interviewAudio } from "./src/jobs/interviewAudio" with { type: "ref" };
import { generateInterviewReport, regenerateStudyReport } from "./src/report/operations" with { type: "ref" };
import { InterviewPage } from "./src/interview/InterviewPage" with { type: "ref" };

export default app({
  name: "mira",
  wasp: { version: "^0.26.1" },
  title: "Mira, user researcher",
  head: [
    "<link rel='icon' type='image/png' sizes='32x32' href='/favicon.png' />",
    "<link rel='apple-touch-icon' sizes='180x180' href='/apple-touch-icon.png' />",
    "<meta name='application-name' content='Mira' />",
    "<meta name='theme-color' content='#F7F5FA' />",
  ],
  spec: [
    route("RootRoute", "/", page(NewStudyPage)),
    route("KnowledgeRoute", "/study/:studyId/knowledge", page(KnowledgePage)),
    route("QuestionnaireRoute", "/study/:studyId/questionnaire", page(QuestionnairePage)),
    route("ReportRoute", "/study/:studyId/report", page(ReportPage)),
    action(importWebsite),
    action(importMcp),
    action(createStudy, { entities: ["Study", "Question", "Source"] }),
    query(getStudies, { entities: ["Study"] }),
    query(getStudy, { entities: ["Study", "Question", "Source"] }),
    action(updateStudy, { entities: ["Study", "Question"] }),
    action(setStudyLogo, { entities: ["Study"] }),
    action(addSource, { entities: ["Study", "Source"] }),
    action(deleteSource, { entities: ["Study", "Source"] }),
    query(getPublicStudy, { entities: ["Study", "Question"] }),
    action(finishInterview, { entities: ["Study", "Interview"] }),
    query(getReport, { entities: ["Study", "Interview", "Theme", "Quote"] }),
    job(processInterview, { executor: "PgBoss", entities: ["Interview", "Study", "Question", "Theme", "Quote"], performExecutorOptions: { pgBoss: { retryLimit: 3, retryDelay: 15, retryBackoff: true } } }),
    api("GET", "/api/interviews/:interviewId/audio", interviewAudio, { entities: ["Interview"] }),
    action(generateInterviewReport),
    action(generateStudyQuestions, { entities: ["Study"] }),
    action(regenerateStudyReport, { entities: ["Study", "Question", "Interview", "Theme", "Quote"] }),
    route("InterviewRoute", "/i/:studyId", page(InterviewPage)),
  ],
});
