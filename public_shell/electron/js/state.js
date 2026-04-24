"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Shared State / Global Variables
// ══════════════════════════════════════════════════════════════════════════════

      // State
      // ══════════════════════════════════════════════════════════════════════════
      let cachedPayload = null;
      let _wizAllocations = []; // staged allocations in teacher form
      let _allTeachers = []; // live teacher cache
      let _allStudents = []; // live student cache
      let devicesMarried = 0;
      let totalGradeEvents = 0;
      const allGradeEvents = [];
      let _phComponents = [
        { key: "CA1", label: "C.A. 1", max: 10 },
        { key: "CA2", label: "C.A. 2", max: 10 },
        { key: "Exam", label: "Exam", max: 80 },
      ];

      // ══════════════════════════════════════════════════════════════════════════
      // Nav State
      let _viewHistory = [];
      let _historyIdx = -1;
      let _sidebarCollapsed = false;

      // Dashboard / Dropdown Metadata
      let _cachedMetadata = null;

      // Result Studio / Bulk Remarks State
      let _rsResultsCache = [];
      let _rsResults = [];
      let _rsLastScope = {};
      let _rsLastImagePath = null;
      let _bulkRemarksData = [];

      // Print Hub State
      let _phResults = [];
      let _phType = "terminal";

      // Settings / Identity State
      let _currentIdentity = null;
      let _schoolTier = "Silver";
      let _stampStyle = "none";
      let _stampCustomColor = null;
      let currentLogoBase64 = null;
      let _stampBase64 = null;

      // Teacher / Student Forms State
      let _customSubjects = { tch: [], edit_tch: [], edit_stu: [] };
      let _editTchAllocations = [];
      let _editTchSignBase64 = null;
      let _wizTchSignBase64 = null;

      // ══════════════════════════════════════════════════════════════════════════
      // Curriculum Presets — subject checkboxes for Add/Edit Teacher & Student
      // ══════════════════════════════════════════════════════════════════════════
      const CurriculumPresets = {
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
              "English Studies", "Mathematics", "Nigerian Languages",
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
              "English Studies", "Mathematics", "Nigerian Languages",
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

