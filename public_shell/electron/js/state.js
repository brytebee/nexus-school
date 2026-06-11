"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Shared State / Global Variables
// ══════════════════════════════════════════════════════════════════════════════

      // State
      // ══════════════════════════════════════════════════════════════════════════
      var cachedPayload = null;
      var _wizAllocations = []; // staged allocations in teacher form
      // State (Global variables)
      var _allTeachers = [];
      var _allStudents = [];
      var devicesMarried = 0;
      var totalGradeEvents = 0;
      var allGradeEvents = [];
      var _phComponents = [
        { key: "CA1", label: "C.A. 1", max: 10 },
        { key: "CA2", label: "C.A. 2", max: 10 },
        { key: "Exam", label: "Exam", max: 80 },
      ];

      // ══════════════════════════════════════════════════════════════════════════
      // Nav State
      var _viewHistory = [];
      var _historyIdx = -1;
      var _sidebarCollapsed = false;

      // Dashboard / Dropdown Metadata
      var _cachedMetadata = null;

      // Result Studio / Bulk Remarks State
      var _rsResultsCache = [];
      var _rsResults = [];
      var _rsLastScope = {};
      var _rsLastImagePath = null;
      var _bulkRemarksData = [];

      // Print Hub State
      var _phResults = [];
      var _phType = "terminal";

      // Settings / Identity State
      // NOTE: currentLogoBase64, _currentIdentity, _schoolTier, _stampStyle,
      // _stampCustomColor, _stampBase64, _principalSignBase64 are owned by
      // settings.js — DO NOT redeclare them here.

      // Teacher / Student Forms State
      var _customSubjects = { tch: [], edit_tch: [], edit_stu: [] };
      var _editTchAllocations = [];
      var _editTchSignBase64 = null;
      var _wizTchSignBase64 = null;

      // ══════════════════════════════════════════════════════════════════════════
      // Curriculum Presets — subject checkboxes for Add/Edit Teacher & Student
      // ══════════════════════════════════════════════════════════════════════════
      var CurriculumPresets = {
        pri_lower: [
          {
            cat: "Core",
            subjects: [
              "Mathematics", "Nigerian Languages", "Basic Science",
              "Physical & Health Education", "CRS", "IS", "Nigerian History",
              "Social & Citizenship Studies", "Cultural & Creative Arts (CCA)",
              "Arabic Language",
            ],
          },
        ],
        pri_upper: [
          {
            cat: "Core",
            subjects: [
              "English Language", "Mathematics", "Nigerian Languages",
              "Basic Science & Technology", "Physical & Health Education",
              "Basic Digital Literacy", "CRS", "IS", "Nigerian History",
              "Social & Citizenship Studies", "Cultural & Creative Arts (CCA)",
              "Pre-vocational studies", "French", "Arabic Language",
            ],
          },
        ],
        jss: [
          {
            cat: "Core",
            subjects: [
              "English Language", "Mathematics", "Nigerian Languages",
              "Intermediate Science", "Physical & Health Education",
              "Digital Technologies", "CRS", "IS", "Nigerian History",
              "Social & Citizenship Studies", "Cultural & Creative Arts (CCA)",
            ],
          },
          {
            cat: "Trade / Optional",
            subjects: [
              "French", "Arabic Language",
              "Solar Photovoltaic installation and Maintenance",
              "Fashion design and garment making", "Livestock farming",
              "Beauty and cosmetology", "Computer hardware and GSM repairs",
              "Horticulture and crop production",
            ],
          },
        ],
        sss: [
          {
            cat: "Core & Compulsory",
            subjects: [
              "English Language", "General Mathematics",
              "Citizenship and Heritage Studies", "Digital Technologies",
            ],
          },
          {
            cat: "Science",
            subjects: [
              "Biology", "Chemistry", "Physics", "Agriculture",
              "Further Mathematics", "Physical Education", "Health Education",
              "Food & Nutrition", "Geography", "Technical Drawing",
            ],
          },
          {
            cat: "Humanities",
            subjects: [
              "Nigerian History", "Government", "Christian Religious Studies",
              "Islamic Studies", "Hausa", "Igbo", "Yoruba", "French", "Arabic",
              "Visual Arts", "Music", "Literature in English",
              "Home Management", "Catering Craft",
            ],
          },
          {
            cat: "Business",
            subjects: ["Accounting", "Commerce", "Marketing", "Economics"],
          },
          {
            cat: "Trade",
            subjects: [
              "Solar PV Installation and Maintenance",
              "Fashion Design and Garment Making", "Livestock Farming",
              "Beauty and Cosmetology", "Computer Hardware and GSM Repairs",
              "Horticulture and Crop Production",
            ],
          },
        ],
      };



      // ══════════════════════════════════════════════════════════════════════════
      // Nav State
