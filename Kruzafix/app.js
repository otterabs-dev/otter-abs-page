/**
 * Hundeberg Trainingsbegleiter & Hausaufgaben-App ("keine Zauberei")
 * Echtzeit-Synchronisation über OtterAbs Firebase Cloud Firestore (pizzatastico-40234)
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. OTTERABS FIREBASE CONFIGURATION
  // ==========================================================================
  const FIREBASE_CONFIG = {
    projectId: "pizzatastico-40234",
    appId: "1:157290366261:web:cb20f126174122ccf6f87c",
    storageBucket: "pizzatastico-40234.firebasestorage.app",
    apiKey: "AIzaSyCQH5_7MfaqsEtbaeS6DSnvJMZ2aIrGryU",
    authDomain: "pizzatastico-40234.firebaseapp.com",
    messagingSenderId: "157290366261",
    measurementId: "G-NCF8XS4LF5"
  };

  const COLLECTION_NAME = "hundeberg_kruzafix";
  const DOC_ID = "live_state_v1";
  const LOCAL_STORAGE_KEY = "hundeberg_kruzafix_state_v1";

  let db = null;
  let unsubscribeSnapshot = null;
  let isApplyingRemoteUpdate = false;
  let activeTeamId = "paul_fifi";
  let activeViewMode = "split";
  let expandedSetups = { "hw_lila_blau": true };

  // ==========================================================================
  // 2. INITIAL SEED STATE (Authentic Hundeberg Courses & Paul + Fifi Scenario)
  // ==========================================================================
  function createDefaultState() {
    return {
      version: 1,
      lastUpdatedAt: Date.now(),
      teams: {
        paul_fifi: {
          id: "paul_fifi",
          ownerName: "Paul",
          dogName: "Fifi",
          dogBreed: "Mischling · 2,5 Jahre",
          avatar: "assets/social-work.jpg",
          activeCourses: "Begegnungstraining, Nasenarbeit & Anti-Jagd-Training",
          primaryTrainer: "Dominika",
          trainerAvatar: "assets/dominika.webp",
          streakDays: 4,
          trainerFeedbackNote: "Hallo Paul, beim letzten Training auf dem Platz in Zell hat Fifi schon toll auf deine Körpersprache reagiert. Übt diese Woche vor allem die 5 Runden bei Lila-Blau im ruhigen Bogen – ganz ohne Eile!",
          homework: [
            {
              id: "hw_lila_blau",
              title: "5 Runden bei Lila-Blau vorbeilaufen",
              category: "Begegnungstraining & Orientierung",
              assignedBy: "Dominika",
              featured: true,
              hasLilaBlauSketch: true,
              summary: "Paul übt mit Hund Fifi, 5 strukturierte Runden im entspannten Bogen an der Lila-Blau-Markierung vorbeizulaufen. Ziel ist eine durchgehend lockere Leine und freiwillige Umorientierung auf Höhe des Reizes.",
              setupSteps: [
                "Aufbau & Farbtargets: Stelle zwei sichtbare Orientierungspunkte in Lila und Blau im Abstand von ca. 4 Metern auf (Blau- und Violetttöne nimmt das Hundeauge besonders kontrastreich wahr). Leine locker aufnehmen, hochwertige Belohnung griffbereit halten.",
                "Ruhige Annäherung: Gehe mit Fifi auf der von Lila-Blau abgewandten Außenseite in gleichmäßigem Schritt los. Sobald Fifi die Markierung wahrnimmt, aber noch entspannt bleibt, folgt dein ruhiges Markersignal.",
                "Im Bogen passieren: Führe Fifi in einem sanften Bogen ohne Leinenruck auf Höhe von Lila-Blau vorbei. Genau auf Höhe der blauen Markierung bestätigst du den Blickkontakt direkt an deinem Bein.",
                "Pause & Reset: Nach jeder absolvierten Runde 10 Sekunden Pause einlegen, kurz durchatmen und Fifi einmal frei schnüffeln lassen, bevor ihr in die nächste Runde startet."
              ],
              rounds: [
                {
                  id: "r1",
                  label: "Runde 1: Großer Bogen (ca. 3m Abstand) bei Lila-Blau – Tempo ruhig einpendeln, Leine bleibt durchhängend.",
                  done: true,
                  doneAt: "Heute, 09:40 Uhr"
                },
                {
                  id: "r2",
                  label: "Runde 2: Gleiche Distanz – Fokus auf frühzeitige Bestätigung, sobald Fifi den Blick von Lila-Blau zu Paul wendet.",
                  done: true,
                  doneAt: "Heute, 09:44 Uhr"
                },
                {
                  id: "r3",
                  label: "Runde 3: Vor der lila Markierung einen sanften Richtungswechsel einbauen – Fifi folgt geschmeidig der Schulterdrehung.",
                  done: false,
                  doneAt: null
                },
                {
                  id: "r4",
                  label: "Runde 4: Abstand auf ca. 2m verkürzen – flüssig bei Lila-Blau vorbeilaufen ohne Stehenbleiben.",
                  done: false,
                  doneAt: null
                },
                {
                  id: "r5",
                  label: "Runde 5: Souveräne Abschlussrunde mit Entspannungssignal und kleiner Futtersuche im Gras zum Ausklang.",
                  done: false,
                  doneAt: null
                }
              ],
              clientMood: "Anfangs aufgeregt, ab Runde 2 ruhig",
              clientNote: "In Runde 1 hat Fifi noch kurz zur lila Pylone gezogen, in Runde 2 hing die Leine schon komplett locker."
            },
            {
              id: "hw_nasenarbeit",
              title: "Geruchsdifferenzierung: 3 Suchdurchgänge an den Boxen",
              category: "Nasenarbeit",
              assignedBy: "Dominika",
              featured: false,
              hasLilaBlauSketch: false,
              summary: "Ruhige Konzentrationsarbeit für zuhause: Fifi sucht konzentriert unter drei ausgelegten Behältern den Zielgeruch und zeigt ihn durch ruhiges Verharren mit der Nase an.",
              setupSteps: [
                "Vorbereitung: Drei flache Kartons oder Suchbehälter im Abstand von je einem Meter aufstellen. Nur einer wird mit dem Zielgeruch oder einem Leckerli unter einem Tuch bestückt.",
                "Start-Ritual: Fifi am Geschirr ruhig vor der Suchlinie ansetzen, kurz warten bis Ruhe einkehrt, dann mit dem festen Suchsignal freigeben.",
                "Anzeige bestätigen: Sobald Fifi die Nase mindestens 2 Sekunden ruhig am richtigen Behälter lässt (ohne Kratzen), direkt am Fundort hochwertig belohnen. Danach Positionen tauschen."
              ],
              rounds: [
                {
                  id: "n1",
                  label: "Durchgang 1: Zielbehälter steht außen links – ruhiger Einstieg mit sofortiger Bestätigung.",
                  done: true,
                  doneAt: "Gestern, 18:15 Uhr"
                },
                {
                  id: "n2",
                  label: "Durchgang 2: Zielbehälter wandert in die Mitte – Anzeigezeit auf 2 Sekunden ausdehnen.",
                  done: true,
                  doneAt: "Gestern, 18:19 Uhr"
                },
                {
                  id: "n3",
                  label: "Durchgang 3: Zielbehälter steht rechts – Abschluss mit Jackpot-Belohnung direkt an der Box.",
                  done: true,
                  doneAt: "Gestern, 18:24 Uhr"
                }
              ],
              clientMood: "Sehr konzentriert & ruhig",
              clientNote: "Nasenarbeit liebt Fifi total, nach den 3 Durchgängen hat sie tief entspannt geschlafen."
            },
            {
              id: "hw_antijagd",
              title: "Impulskontrolle & Umorientierung am Waldrand",
              category: "Anti-Jagd-Training",
              assignedBy: "Saskia",
              featured: false,
              hasLilaBlauSketch: false,
              summary: "Statt unkontrolliertem Nachsetzen lernen Paul und Fifi das ruhige Vorstehen zu markieren und die Energie in eine gemeinsame Ersatzsuche mit dem Futterbeutel umzulenken.",
              setupSteps: [
                "Sicherung & Ort: Fifi an der 5m-Schleppleine am gut sitzenden Brustgeschirr sichern. Einen übersichtlichen Wiesen- oder Waldrand wählen.",
                "Vorstehen markieren: Bleibt Fifi stehen und wittert in Richtung Waldrand, niemals an der Leine rucken. Stattdessen das ruhige Stehenbleiben sofort markieren.",
                "Gemeinsame Ersatzjagd: Dreht Fifi auf das Markersignal den Kopf zu Paul um, fliegt das rote Futtersäckchen als Belohnung in die entgegengesetzte Richtung."
              ],
              rounds: [
                {
                  id: "aj1",
                  label: "Wiederholung 1: Ruhiges Stehenbleiben und Wittern am Wegesrand markieren, Beutel 2m zurückwerfen.",
                  done: true,
                  doneAt: "Mittwoch, 16:30 Uhr"
                },
                {
                  id: "aj2",
                  label: "Wiederholung 2: Selbstständige Blickabwendung vom Gebüsch abwarten und hochwertig belohnen.",
                  done: false,
                  doneAt: null
                },
                {
                  id: "aj3",
                  label: "Wiederholung 3: Stopp-Signal aus dem lockeren Trab aufbauen und gemeinsam zum Futterbeutel laufen.",
                  done: false,
                  doneAt: null
                },
                {
                  id: "aj4",
                  label: "Wiederholung 4: Ruhiges Ausschütteln und entspanntes Weitergehen an lockerer Leine.",
                  done: false,
                  doneAt: null
                }
              ],
              clientMood: "Noch etwas aufgeregt, aber ansprechbar",
              clientNote: ""
            },
            {
              id: "hw_hoopers",
              title: "Distanz-Kreis: 4 Bögen um die Pylone schicken",
              category: "Hoopers & Longieren",
              assignedBy: "Martina",
              featured: false,
              hasLilaBlauSketch: false,
              summary: "Vertrauen und Führung auf Distanz: Paul bleibt fest im Führbereich stehen und schickt Fifi allein über Körpersprache und Handzeichen geschmeidig um die Markierung.",
              setupSteps: [
                "Führzone festlegen: Einen festen Standpunkt markieren, den Paul während der Übung nicht verlässt. Die Pylone oder Tonne steht 3 Meter entfernt.",
                "Körpersprachliche Einladung: Mit offener Schulter und klarer Handgeste Fifi um die Pylone einladen, ohne selbst mitzulaufen.",
                "Belohnung in Laufrichtung: Sobald Fifi die Rundung annimmt, verbal bestätigen und die Belohnung flüssig übergeben."
              ],
              rounds: [
                {
                  id: "hp1",
                  label: "Bogen 1: Linke Handführung auf 3 Meter Distanz – sauberer Blickfokus auf die Pylone.",
                  done: false,
                  doneAt: null
                },
                {
                  id: "hp2",
                  label: "Bogen 2: Rechte Handführung auf 3 Meter Distanz – ruhiger Handwechsel.",
                  done: false,
                  doneAt: null
                },
                {
                  id: "hp3",
                  label: "Bogen 3: Distanz auf 4,5 Meter vergrößern – Paul bleibt ruhig in der Führzone stehen.",
                  done: false,
                  doneAt: null
                },
                {
                  id: "hp4",
                  label: "Bogen 4: Zwei flüssige Runden hintereinander mit ruhigem Abschlusssignal.",
                  done: false,
                  doneAt: null
                }
              ],
              clientMood: "Offen",
              clientNote: ""
            }
          ]
        },

        julia_balu: {
          id: "julia_balu",
          ownerName: "Julia",
          dogName: "Balu",
          dogBreed: "Australian Shepherd · 1,5 Jahre",
          avatar: "assets/antijagd.jpg",
          activeCourses: "Anti-Jagd-Training & Longieren",
          primaryTrainer: "Saskia",
          trainerAvatar: "assets/saskia.jpg",
          streakDays: 3,
          trainerFeedbackNote: "Julia, eure Ruhe am Longierkreis zahlt sich richtig aus! Denkt beim Anti-Jagd-Training daran: Erst das ruhige Schauen bestätigen, bevor Bewegung ins Spiel kommt.",
          homework: [
            {
              id: "hw_balu_1",
              title: "4 Runden Longierkreis mit Tempowechsel auf Distanz",
              category: "Longieren",
              assignedBy: "Saskia",
              featured: true,
              hasLilaBlauSketch: false,
              summary: "Balu läuft außen am Kreisband und achtet auf Julias Schulterachse: Wechsel zwischen ruhigem Trab und sofortigem Sitz auf Distanz.",
              setupSteps: [
                "Kreisband oder 6 Bodenmarkierungen mit ca. 6 Metern Durchmesser auslegen.",
                "Julia steht entspannt in der Kreismitte und führt Balu über die offene Körperseite.",
                "Nach jeder halben Runde ein ruhiges Stopp-Signal über Aufrichten des Oberkörpers geben."
              ],
              rounds: [
                { id: "jb1", label: "Runde 1: Linke Hand im lockeren Trab außen am Band.", done: true, doneAt: "Heute, 08:20 Uhr" },
                { id: "jb2", label: "Runde 2: Rechte Hand mit zwei Stopps auf Distanz.", done: true, doneAt: "Heute, 08:23 Uhr" },
                { id: "jb3", label: "Runde 3: Wechsel von Trab in langsamen Schritt über Körpersprache.", done: true, doneAt: "Heute, 08:27 Uhr" },
                { id: "jb4", label: "Runde 4: Ruhige Freigabe zur gemeinsamen Futtersuche am Boden.", done: false, doneAt: null }
              ],
              clientMood: "Sehr konzentriert & ruhig",
              clientNote: "Linke Seite klappt super, rechts wollte er einmal kurz in den Kreis abkürzen."
            },
            {
              id: "hw_balu_2",
              title: "Reizangel-Ruheübung: 3 Durchgänge Standruhe bei Bewegung",
              category: "Anti-Jagd-Training",
              assignedBy: "Saskia",
              featured: false,
              hasLilaBlauSketch: false,
              summary: "Balu bleibt bei bewegtem Reiz (Futterdummy an der Schnur) entspannt stehen und wartet auf das Freigabesignal.",
              setupSteps: [
                "Futterdummy in 4 Metern Entfernung langsam über den Boden ziehen.",
                "Bleibt Balu stehen und orientiert sich zu Julia: sofort Markerwort und Belohnung an der Hand."
              ],
              rounds: [
                { id: "jb5", label: "Durchgang 1: Langsame Bewegung des Dummys am Boden.", done: true, doneAt: "Gestern" },
                { id: "jb6", label: "Durchgang 2: Kurzes Stoppen und erneutes Anziehen des Dummys.", done: true, doneAt: "Gestern" },
                { id: "jb7", label: "Durchgang 3: Freigabe zum Apportieren erst nach Blickkontakt.", done: true, doneAt: "Gestern" }
              ],
              clientMood: "Sehr konzentriert & ruhig",
              clientNote: "Hat alle drei Durchgänge ohne Einspringen gemeistert."
            }
          ]
        },

        markus_lotte: {
          id: "markus_lotte",
          ownerName: "Markus",
          dogName: "Lotte",
          dogBreed: "Labrador Retriever · 3 Jahre",
          avatar: "assets/anti-giftkoeder.jpg",
          activeCourses: "Anti-Giftköder-Training & Hoopers",
          primaryTrainer: "Dominika",
          trainerAvatar: "assets/dominika.webp",
          streakDays: 5,
          trainerFeedbackNote: "Markus, Lottes Anzeige vor gefundenem Futter am Boden ist schon richtig zuverlässig! Übt diese Woche das Rückwärtsweichen vom Fundstück.",
          homework: [
            {
              id: "hw_lotte_1",
              title: "4 Durchgänge: Futterfund anzeigen & 2 Schritte rückwärts weichen",
              category: "Anti-Giftköder-Training",
              assignedBy: "Dominika",
              featured: true,
              hasLilaBlauSketch: false,
              summary: "Lotte stoppt vor ausgelegtem Futter am Boden, nimmt Blickkontakt zu Markus auf und weicht zwei Schritte vom Fundort zurück.",
              setupSteps: [
                "Ein gut sichtbares Futterstück auf einem flachen Deckel am Boden platzieren.",
                "An lockerer Leine vorbeigehen. Sobald Lotte das Futter sieht und stoppt: Markerwort.",
                "Hochwertige Belohnung aus der Hand rückwärts von der Fundstelle weg füttern."
              ],
              rounds: [
                { id: "ml1", label: "Durchgang 1: Ausgelegtes Trockenfutter auf dem Gartenweg anzeigen.", done: true, doneAt: "Heute, 07:50 Uhr" },
                { id: "ml2", label: "Durchgang 2: Selbstständige Blickaufnahme zu Markus bestätigen.", done: true, doneAt: "Heute, 07:54 Uhr" },
                { id: "ml3", label: "Durchgang 3: Zwei Schritte rückwärts vom Fundort weichen.", done: true, doneAt: "Heute, 07:58 Uhr" },
                { id: "ml4", label: "Durchgang 4: Ablenkung durch höherwertigen Geruch (Käse unter Sieb).", done: true, doneAt: "Heute, 08:02 Uhr" }
              ],
              clientMood: "Sehr konzentriert & ruhig",
              clientNote: "Lotte hat heute sogar beim echten Spaziergang ein altes Brötchen angezeigt!"
            }
          ]
        }
      },

      activityFeed: [
        {
          id: "ev_init_1",
          timestamp: "Heute, 09:44 Uhr",
          teamName: "Paul & Fifi",
          category: "Begegnungstraining",
          text: "Paul hat mit Fifi Runde 2 von 5 bei '5 Runden bei Lila-Blau vorbeilaufen' abgehakt.",
          highlight: true
        },
        {
          id: "ev_init_2",
          timestamp: "Heute, 09:40 Uhr",
          teamName: "Paul & Fifi",
          category: "Begegnungstraining",
          text: "Paul hat mit Fifi Runde 1 von 5 bei '5 Runden bei Lila-Blau vorbeilaufen' abgehakt (Notiz: 'In Runde 2 hing die Leine schon komplett locker').",
          highlight: false
        },
        {
          id: "ev_init_3",
          timestamp: "Heute, 08:27 Uhr",
          teamName: "Julia & Balu",
          category: "Longieren",
          text: "Julia hat mit Balu Runde 3 von 4 bei 'Longierkreis mit Tempowechsel auf Distanz' erledigt.",
          highlight: false
        },
        {
          id: "ev_init_4",
          timestamp: "Heute, 08:02 Uhr",
          teamName: "Markus & Lotte",
          category: "Anti-Giftköder-Training",
          text: "Markus hat die Hausaufgabe 'Futterfund anzeigen & rückwärts weichen' komplett abgeschlossen (4/4 Durchgänge).",
          highlight: false
        },
        {
          id: "ev_init_5",
          timestamp: "Gestern, 18:24 Uhr",
          teamName: "Paul & Fifi",
          category: "Nasenarbeit",
          text: "Paul hat die Hausaufgabe 'Geruchsdifferenzierung: 3 Suchdurchgänge an den Boxen' vollständig erledigt (3/3).",
          highlight: false
        }
      ]
    };
  }

  // ==========================================================================
  // 3. HUNDEBERG COURSE CATALOG DATA (All 9 Original Offerings)
  // ==========================================================================
  const HUNDEBERG_COURSES = [
    {
      id: "c_socialwalk",
      title: "Socialwalk / Begegnungstraining",
      image: "assets/social-work.jpg",
      desc: "Verbessere das Sozialverhalten deines Hundes. Wir helfen, ruhig und kontrolliert auf andere Hunde und Menschen zu reagieren.",
      exercises: [
        "5 Runden bei Lila-Blau im lockeren Bogen vorbeilaufen",
        "Pendel-Blickkontakt bei Hundesichtung auf 15 Meter Distanz",
        "Seitenwechsel hinter dem Rücken zur Abschirmung"
      ],
      templateHw: {
        title: "Pendel-Blickkontakt: 5 Begegnungen im Bogen begleiten",
        category: "Begegnungstraining / Socialwalk",
        assignedBy: "Dominika",
        summary: "Bei Sichtung eines anderen Hundes darf Fifi ruhig hinschauen, wird dafür markiert und wendet den Blick entspannt wieder zu Paul zurück.",
        setupSteps: [
          "Wohlfühldistanz wählen, in der Fifi den anderen Hund sieht, aber noch ansprechbar bleibt.",
          "Den ersten ruhigen Blick zum Reiz markieren ('Schau') und die Umorientierung zu Paul an der abgewandten Hand belohnen.",
          "In einem weiten Bogen weitergehen, ohne dass die Leine auf Spannung gerät."
        ],
        roundsLabels: [
          "Begegnung 1: Große Distanz (ca. 15m) – erstes ruhiges Hinschauen markieren.",
          "Begegnung 2: Selbstständiges Umorientieren zu Paul abwarten und bestätigen.",
          "Begegnung 3: Hund auf die abgewandte Außenseite nehmen und im Bogen passieren.",
          "Begegnung 4: Zwei kurze Blick-Pendel hintereinander ruhig belohnen.",
          "Begegnung 5: Nach der Begegnung gemeinsames Ausschütteln und Leckerlisuche."
        ]
      }
    },
    {
      id: "c_nasenarbeit",
      title: "Nasenarbeit",
      image: "assets/nasenarbeit.jpg",
      desc: "Aktiviere den Spürsinn deines Hundes und stärke gleichzeitig eure Beziehung durch spannende, strukturierte Suchspiele.",
      exercises: [
        "Geruchsdifferenzierung an 3 Suchbehältern im Wohnzimmer",
        "Verlorensuche eines Schlüsselbunds oder Futterbeutels auf dem Weg",
        "Feinsuche an Baumrinde oder Mauerfugen (5 Fundorte)"
      ],
      templateHw: {
        title: "Feinsuche im Alltag: 4 versteckte Geruchsdepots finden",
        category: "Nasenarbeit",
        assignedBy: "Dominika",
        summary: "Nasenarbeit lastet Fifi geistig tief aus und senkt das Erregungsniveau: 4 kleine Geruchsverstecke auf Nasenhöhe ruhig ausarbeiten lassen.",
        setupSteps: [
          "Fifi kurz im Sitz oder am Startpunkt warten lassen, während im Umkreis von 3 Metern ein kleines Futter- oder Teebeutel-Versteck platziert wird.",
          "Mit ruhigem Handzeichen und festem Suchsignal in das Suchgebiet schicken.",
          "Nicht vorsagen – Fifi selbstständig mit der Nase arbeiten lassen und direkt am Fundort belohnen."
        ],
        roundsLabels: [
          "Suchdurchgang 1: Versteck auf Bodenhöhe (z.B. an einem Stuhlbein oder Stein).",
          "Suchdurchgang 2: Versteck auf ca. 20cm Höhe (z.B. Treppenstufe oder Baumstamm).",
          "Suchdurchgang 3: Suchfeld etwas vergrößern – ruhig abwarten bis Fifi anzeigt.",
          "Suchdurchgang 4: Kurzer Abschluss-Durchgang mit leichtem Fund für sicheren Erfolg."
        ]
      }
    },
    {
      id: "c_antijagd",
      title: "Anti-Jagd-Training",
      image: "assets/antijagd.jpg",
      desc: "Speziell darauf ausgerichtet, das Jagdverhalten deines Hundes zu kontrollieren, frühzeitig zu lesen und in sichere Bahnen zu lenken.",
      exercises: [
        "Ruhiges Vorstehen am Waldrand markieren statt Leinenruck",
        "Umorientierungssignal mit gemeinsamer Futterbeutel-Ersatzjagd",
        "Notfall-Stopp aus der Bewegung (5 Wiederholungen)"
      ],
      templateHw: {
        title: "Anti-Jagd: 5x Vorstehen markieren & Beutel-Ersatzsuche",
        category: "Anti-Jagd-Training",
        assignedBy: "Saskia",
        summary: "Jagdverhalten wird nicht unterdrückt, sondern kooperativ umgelenkt: Zeigt Fifi Wildgeruch durch Stehenbleiben an, folgt bei Paul die beste Belohnung.",
        setupSteps: [
          "Schleppleine am Brustgeschirr befestigen, Futterbeutel griffbereit in der Tasche.",
          "Sobald Fifi die Nase hebt oder eine Pfote anwinkelt (Vorstehen): sofort ruhiges Markersignal geben.",
          "Wendet Fifi sich zu Paul um, wird der Futterbeutel gemeinsam in Gegenrichtung erbeutet."
        ],
        roundsLabels: [
          "Durchgang 1: Erstes Wittern im Wind sofort ruhig markieren und bei Paul belohnen.",
          "Durchgang 2: Futterbeutel 3 Meter rückwärts vom Reiz weg werfen und gemeinsam holen.",
          "Durchgang 3: Fifi am Wegesrand absitzen lassen, während der Beutel versteckt wird.",
          "Durchgang 4: Rückruf aus leichtem Schnüffeln mit Jackpot-Bestätigung.",
          "Durchgang 5: Ruhiger Abschluss an kurzer Leine mit Entspannungssignal."
        ]
      }
    },
    {
      id: "c_hoopers",
      title: "Hoopers",
      image: "assets/hoopers.jpg",
      desc: "Hoopers – Vertrauen und Kommunikation auf Distanz. Steigere das körperliche und geistige Wohlbefinden deines Hundes gelenkschonend.",
      exercises: [
        "Distanzführung durch 2 Bögen (Hoops) ohne Mitlaufen",
        "Richtungswechsel um die Tonne per Körpersprache & Handzeichen",
        "Vorausschicken zum Boden-Target auf 5 Meter"
      ],
      templateHw: {
        title: "Hoopers-Aufbau: 5x Vorausschicken zum blauen Bodentarget",
        category: "Hoopers",
        assignedBy: "Martina",
        summary: "Grundstein für Hoopers auf Distanz: Fifi löst sich selbstständig von Paul, läuft geradlinig zum blauen Target-Teppich voraus und wartet dort auf das Folgesignal.",
        setupSteps: [
          "Eine rutschfeste blaue Matte oder ein Target in 3 bis 5 Metern Entfernung auslegen.",
          "Fifi neben sich ausrichten, Blick gemeinsam zum Target richten und mit klarem Armsignal vorausschicken.",
          "Die Belohnung fällt direkt auf das Target, damit der Zug nach vorne erhalten bleibt."
        ],
        roundsLabels: [
          "Durchgang 1: Kurze Distanz (2 Meter) – schnelles, freudiges Anlaufen bestätigen.",
          "Durchgang 2: Distanz auf 3,5 Meter erhöhen – Paul bleibt am Startpunkt stehen.",
          "Durchgang 3: Nach dem Target-Kontakt direkt eine Tonne oder Stange umrunden lassen.",
          "Durchgang 4: Seitlicher Abstand (1,5 Meter versetzt) beim Vorausschicken.",
          "Durchgang 5: Flüssige Kombination aus Target und Rückkehr in die Führhand."
        ]
      }
    },
    {
      id: "c_longieren",
      title: "Longieren",
      image: "assets/longieren.jpg",
      desc: "Die innovative Methode, um die Bindung zu deinem Hund zu intensivieren, seine Konzentration sowie Distanzkontrolle spielerisch zu steigern.",
      exercises: [
        "Kreisarbeit: 5 Runden mit feinen Tempowechseln (Schritt / Trab)",
        "Richtungswechsel am Kreisband allein über die Schulterdrehung",
        "Stopp & Sitz auf Distanz außerhalb der Tabuzone"
      ],
      templateHw: {
        title: "Longieren: 4 Runden Schulter-Fokus & Richtungswechsel",
        category: "Longieren",
        assignedBy: "Martina",
        summary: "Auch ohne großen Longierkreis im Alltag übbar: Um einen runden Busch, Baum oder 4 Pylonen lernt Fifi, genau auf Pauls Schulterstellung zu achten.",
        setupSteps: [
          "Einen natürlichen Kreis (ca. 4–6m Durchmesser, z.B. um eine Baumgruppe oder 4 Pylonen) wählen.",
          "Paul bewegt sich ruhig im Inneren, Fifi läuft außen auf einer gedachten Kreisbahn.",
          "Dreht Paul die innere Schulter leicht ein, wechselt Fifi geschmeidig die Laufrichtung."
        ],
        roundsLabels: [
          "Runde 1: Ruhiger Einstieg im Uhrzeigersinn – Blickkontakt außen belohnen.",
          "Runde 2: Sanfter Richtungswechsel über Eindrehen der Körperachse.",
          "Runde 3: Tempowechsel von normalem Gehen in ganz langsamen Schritt.",
          "Runde 4: Stopp auf Handzeichen mit anschließender Freigabe."
        ]
      }
    },
    {
      id: "c_antigift",
      title: "Anti-Giftköder-Training",
      image: "assets/anti-giftkoeder.jpg",
      desc: "Schütze deinen Hund vor den Gefahren von Giftködern. Lerne gemeinsam mit deinem Hund, Gefundenes anzuzeigen und zuverlässig zu meiden.",
      exercises: [
        "Anzeigeverhalten: Vor Bodenfutter einfrieren & Blickkontakt aufnehmen",
        "Geschlossene Hand vs. offene Hand (Impulskontrolle)",
        "Rückwärtsweichen vom Fundort auf Signal"
      ],
      templateHw: {
        title: "Anti-Giftköder: 4x Bodenfund anzeigen & umorientieren",
        category: "Anti-Giftköder-Training",
        assignedBy: "Dominika",
        summary: "Gefundenes am Boden bedeutet für Fifi nicht 'schnell schlucken', sondern: 'Ich zeige es Paul an und bekomme dafür etwas viel Besseres aus seiner Hand'.",
        setupSteps: [
          "Ein trockenes Futterstück gut sichtbar am Boden platzieren (anfangs mit Fuß oder Deckel absicherbar).",
          "Mit lockerer Leine in 1 Meter Abstand vorbeigehen. Stoppt Fifi oder schaut vom Futter zu Paul: sofort Markerwort.",
          "Drei hochwertige Leckerlis nacheinander weg vom Fundort aus der Hand füttern."
        ],
        roundsLabels: [
          "Durchgang 1: Futterstück liegt unter einem umgedrehten Nudelsieb – ruhiges Anschauen markieren.",
          "Durchgang 2: Offenes Futterstück bei 1,5m Abstand passieren und Blick zu Paul belohnen.",
          "Durchgang 3: Nach dem Anzeigen zwei Schritte rückwärts mit Paul mitlaufen.",
          "Durchgang 4: Überraschungs-Fundstück beim normalen Hof- oder Gartengang anzeigen."
        ]
      }
    },
    {
      id: "c_basis",
      title: "Basiskurs",
      image: "assets/basis.jpg",
      desc: "Starte in die Welt der Hundeerziehung! Lerne wichtige Alltagssignale in einer positiven Umgebung, um eine tiefe Bindung aufzubauen.",
      exercises: [
        "Orientierung an der lockeren Leine mit Richtungswechseln",
        "Aufbau des positiven Rückrufsignals auf kurze Distanz",
        "Deckentraining & Ruhezone zuhause etablieren"
      ],
      templateHw: {
        title: "Basiskurs: 5x Rückruf-freudiges Ankommen mit Handtouch",
        category: "Basiskurs",
        assignedBy: "Saskia",
        summary: "Ein sicherer Rückruf entsteht durch klare Freude: Fifi lernt, auf das Rückrufsignal direkt bis an Pauls geöffnete Handfläche (Handtouch) durchzulaufen.",
        setupSteps: [
          "Nur rufen, wenn Fifi gerade nicht tief festgeschnüffelt ist (leichte Ausgangslage wählen).",
          "Rückrufsignal freundlich rufen, seitlich einladen und die flache Hand auf Brusthöhe des Hundes anbieten.",
          "Sobald Fifis Nase die Handfläche berührt: Markerwort und 3 Sekunden lang aus der Hand füttern."
        ],
        roundsLabels: [
          "Wiederholung 1: Im Haus oder Garten ohne Ablenkung auf 3 Meter Distanz.",
          "Wiederholung 2: Beim Spaziergang aus lockerem Schnüffeln heraus abrufen.",
          "Wiederholung 3: Nach dem Handtouch sofort wieder zum Weiterschnüffeln freigeben.",
          "Wiederholung 4: Zwei Schritte rückwärts laufen beim Rufen für mehr Dynamik.",
          "Wiederholung 5: Abschluss-Rückruf mit besonderer Lieblingsbelohnung."
        ]
      }
    },
    {
      id: "c_welpen",
      title: "Welpenkurs",
      image: "assets/welpen.jpg",
      desc: "Gib deinem Welpen einen optimalen Start ins Leben – mit spielerischem Lernen, Umweltgewöhnung und wohlwollenden sozialen Interaktionen.",
      exercises: [
        "Ruhedecke & Entspannung nach neuen Umweltreizen",
        "Spielerischer Name-Reaktions-Check ohne Ablenkung",
        "Medical Training: Pfoten, Ohren und Brustgeschirr ruhig berühren"
      ],
      templateHw: {
        title: "Medical & Ruhe-Training: 4 kurze Wohlfühl-Einheiten",
        category: "Welpenkurs / Alltag",
        assignedBy: "Saskia",
        summary: "Ruhiges Anfassenlassen für Tierarzt und Pflege: Jede angekündigte Berührung an Pfote, Ohr und Geschirr wird ruhig bestätigt.",
        setupSteps: [
          "Ruhige Atmosphäre zuhause auf einer rutschfesten Decke schaffen.",
          "Die Berührung kurz mit einem festen Wort ('Pfote' / 'Ohr') ankündigen, 2 Sekunden sanft halten, loslassen und belohnen."
        ],
        roundsLabels: [
          "Einheit 1: Vorderpfoten kurz in die Hand nehmen und ruhig absetzen.",
          "Einheit 2: Sanfter Blick in beide Ohren mit direkter Bestätigung.",
          "Einheit 3: Brustgeschirr über den Kopf streifen, während der Hund selbst durchschlüpft.",
          "Einheit 4: 3 Minuten ruhiges Liegen auf der Hausdecke neben dem Menschen."
        ]
      }
    },
    {
      id: "c_einzel",
      title: "Einzeltraining",
      image: "assets/einzeltraining.jpg",
      desc: "Maßgeschneiderte Unterstützung für euer Mensch-Hund-Team. Wir gehen individuell auf eure Bedürfnisse und Alltagsthemen ein.",
      exercises: [
        "Individueller Trainingsplan exakt abgestimmt auf eure Wohnsituation",
        "Video- oder Protokoll-Rückmeldung zwischen den Einzelstunden",
        "Gezieltes Kleinschritt-Training (wie 5 Runden bei Lila-Blau)"
      ],
      templateHw: {
        title: "Individuelles Ruhe-Ritual: 5x Entspanntes Starten an der Haustür",
        category: "Einzeltraining",
        assignedBy: "Dominika",
        summary: "Ein entspannter Spaziergang beginnt bereits vor der Haustür: 5 strukturierte Starts ohne Fiepen oder Nach-vorne-Schießen an der Schwelle.",
        setupSteps: [
          "Brustgeschirr in Ruhe anlegen. Ist Fifi schon aufgeregt, 30 Sekunden ruhig abwarten.",
          "Haustür einen Spalt öffnen. Bleibt Fifi bei Paul orientiert, geht die Tür ganz auf.",
          "Gemeinsam auf das Freigabesignal ruhig über die Schwelle treten."
        ],
        roundsLabels: [
          "Start 1: Morgenrunde – Ruhe beim Anlegen des Geschirrs abwarten.",
          "Start 2: Türgriff berühren, ohne dass Fifi zur Tür drängt.",
          "Start 3: Offene Haustür – kurzer Blickkontakt zu Paul vor dem Herausgehen.",
          "Start 4: Erste 10 Meter auf dem Gehweg im ganz ruhigen Tempo gehen.",
          "Start 5: Abendrunde mit demselben ruhigen Tür-Ritual."
        ]
      }
    }
  ];

  // ==========================================================================
  // 4. STATE MANAGEMENT & OTTERABS FIREBASE SYNC
  // ==========================================================================
  let appState = loadLocalState();

  function loadLocalState() {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.teams && parsed.teams.paul_fifi) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Lokaler Speicher konnte nicht geladen werden:", e);
    }
    return createDefaultState();
  }

  function saveLocalState() {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appState));
    } catch (e) {
      console.warn("Lokales Speichern fehlgeschlagen:", e);
    }
  }

  function updateSyncStatusUI(statusText, isSyncing) {
    const dot = document.getElementById("firebaseSyncDot");
    const text = document.getElementById("firebaseSyncText");
    if (dot) {
      if (isSyncing) {
        dot.classList.add("syncing");
      } else {
        dot.classList.remove("syncing");
      }
    }
    if (text) {
      text.textContent = statusText;
    }
  }

  function initFirebase() {
    try {
      if (typeof firebase === "undefined") {
        updateSyncStatusUI("Lokaler Modus (Offline)", false);
        return;
      }
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      db = firebase.firestore();
      updateSyncStatusUI("OtterAbs Firebase: Verbinde...", true);

      const docRef = db.collection(COLLECTION_NAME).doc(DOC_ID);

      unsubscribeSnapshot = docRef.onSnapshot(
        function (docSnap) {
          if (docSnap.exists) {
            const remoteData = docSnap.data();
            if (remoteData && remoteData.teams && remoteData.teams.paul_fifi) {
              isApplyingRemoteUpdate = true;
              appState = remoteData;
              saveLocalState();
              renderAll();
              isApplyingRemoteUpdate = false;
              updateSyncStatusUI("OtterAbs Firebase · Live-Sync aktiv", false);
            }
          } else {
            // Initialize remote document with default seed state
            pushStateToFirebase("Initialer Hundeberg-Prototyp angelegt");
          }
        },
        function (err) {
          console.warn("Firestore Listener Hinweis:", err);
          updateSyncStatusUI("Lokaler Speicher aktiv", false);
        }
      );
    } catch (err) {
      console.warn("Firebase Initialisierung Hinweis:", err);
      updateSyncStatusUI("Lokaler Speicher aktiv", false);
    }
  }

  function pushStateToFirebase(actionSummary) {
    appState.lastUpdatedAt = Date.now();
    saveLocalState();
    renderAll();

    if (!db || isApplyingRemoteUpdate) return;
    updateSyncStatusUI("Speichere in OtterAbs Firebase...", true);

    db.collection(COLLECTION_NAME)
      .doc(DOC_ID)
      .set(JSON.parse(JSON.stringify(appState)))
      .then(function () {
        updateSyncStatusUI("OtterAbs Firebase · Live-Sync aktiv", false);
      })
      .catch(function (err) {
        console.warn("Firestore Schreib-Hinweis:", err);
        updateSyncStatusUI("Lokal gespeichert", false);
      });
  }

  function formatNowTime() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return "Gerade eben (" + hh + ":" + mm + " Uhr)";
  }

  function addActivityEvent(teamName, category, text, highlight) {
    appState.activityFeed.unshift({
      id: "ev_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      timestamp: formatNowTime(),
      teamName: teamName,
      category: category,
      text: text,
      highlight: Boolean(highlight)
    });
    if (appState.activityFeed.length > 25) {
      appState.activityFeed = appState.activityFeed.slice(0, 25);
    }
  }

  // ==========================================================================
  // 5. UI HELPERS & SVG TACTICAL SKETCH FOR "5 RUNDEN BEI LILA-BLAU"
  // ==========================================================================
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(message) {
    const toast = document.getElementById("hbToast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      toast.classList.remove("visible");
    }, 3400);
  }

  function buildLilaBlauTacticalSvg(completedCount, totalCount) {
    return (
      '<div class="hb-tactic-sketch">' +
        '<svg viewBox="0 0 560 175" width="100%" height="auto" role="img" aria-label="Trainingsaufbau 5 Runden bei Lila-Blau vorbeilaufen">' +
          '<rect x="4" y="4" width="552" height="167" rx="12" fill="#EFECE4" stroke="#65745B" stroke-opacity="0.3" />' +
          '<!-- Rasen-Hilfslinien -->' +
          '<line x1="36" y1="88" x2="524" y2="88" stroke="#65745B" stroke-opacity="0.18" stroke-dasharray="4 4" />' +
          '<!-- Laufbogen für Paul & Fifi -->' +
          '<path d="M 65 132 Q 280 18 495 132" fill="none" stroke="#65745B" stroke-width="3" stroke-dasharray="7 5" />' +
          '<!-- Pfeilspitze am Ende des Bogens -->' +
          '<polygon points="498,134 485,127 490,119" fill="#65745B" />' +
          '<!-- Startpunkt Links -->' +
          '<circle cx="65" cy="132" r="14" fill="#65745B" />' +
          '<text x="65" y="136" text-anchor="middle" fill="#E9E4D7" font-size="10" font-weight="600">START</text>' +
          '<text x="65" y="156" text-anchor="middle" fill="#2D2319" font-size="11" font-weight="500">Paul &amp; Fifi</text>' +
          '<!-- Lila Markierung -->' +
          '<circle cx="225" cy="122" r="16" fill="#6B4D8B" stroke="#FFFFFF" stroke-width="2" />' +
          '<text x="225" y="126" text-anchor="middle" fill="#FFFFFF" font-size="10" font-weight="600">LILA</text>' +
          '<text x="225" y="152" text-anchor="middle" fill="#5E5246" font-size="10.5">Target 1 (Reizbeginn)</text>' +
          '<!-- Blaue Markierung -->' +
          '<circle cx="335" cy="122" r="16" fill="#286090" stroke="#FFFFFF" stroke-width="2" />' +
          '<text x="335" y="126" text-anchor="middle" fill="#FFFFFF" font-size="10" font-weight="600">BLAU</text>' +
          '<text x="335" y="152" text-anchor="middle" fill="#5E5246" font-size="10.5">Target 2 (4m Abstand)</text>' +
          '<!-- Scheitelpunkt / Belohnungspunkt -->' +
          '<circle cx="280" cy="74" r="11" fill="#A50019" />' +
          '<text x="280" y="52" text-anchor="middle" fill="#A50019" font-size="11" font-weight="600">Bogen-Scheitelpunkt: Blickkontakt bestätigen</text>' +
          '<!-- Ziel & Reset Rechts -->' +
          '<circle cx="495" cy="132" r="14" fill="#4F5C47" />' +
          '<text x="495" y="136" text-anchor="middle" fill="#E9E4D7" font-size="10" font-weight="600">' + completedCount + '/' + totalCount + '</text>' +
          '<text x="495" y="156" text-anchor="middle" fill="#2D2319" font-size="11" font-weight="500">10s Schnüffel-Reset</text>' +
        '</svg>' +
        '<div class="hb-tactic-caption">' +
          'Übungsaufbau auf dem Platz oder Spaziergang: Fifi läuft auf der abgewandten Außenseite im ruhigen Bogen an Lila und Blau vorbei.' +
        '</div>' +
      '</div>'
    );
  }

  // ==========================================================================
  // 6. RENDER CUSTOMER APP PANE (Paul & Fifi)
  // ==========================================================================
  function renderCustomerPane() {
    const team = appState.teams[activeTeamId] || appState.teams.paul_fifi;
    const headerTitleEl = document.getElementById("customerPaneHeaderTitle");
    if (headerTitleEl) {
      headerTitleEl.textContent = "Trainingsheft · " + team.ownerName + " & " + team.dogName;
    }

    const selfDogEl = document.getElementById("selfTrainDogName");
    if (selfDogEl) {
      selfDogEl.textContent = team.dogName;
    }

    // Calculate total round completion for this team
    let totalRounds = 0;
    let completedRounds = 0;
    let completedHwCount = 0;

    team.homework.forEach(function (hw) {
      const hwTotal = hw.rounds.length;
      const hwDone = hw.rounds.filter(function (r) { return r.done; }).length;
      totalRounds += hwTotal;
      completedRounds += hwDone;
      if (hwTotal > 0 && hwDone === hwTotal) {
        completedHwCount += 1;
      }
    });

    const pct = totalRounds > 0 ? Math.round((completedRounds / totalRounds) * 100) : 0;

    // 1) Render Profile & Weekly Progress Card
    const profileEl = document.getElementById("customerProfileCard");
    if (profileEl) {
      profileEl.innerHTML =
        '<div class="hb-dog-profile-top">' +
          '<div class="hb-dog-identity">' +
            '<img src="' + escapeHtml(team.avatar) + '" alt="' + escapeHtml(team.dogName) + '" class="hb-dog-avatar" />' +
            '<div>' +
              '<h3>' + escapeHtml(team.ownerName) + ' mit Hund ' + escapeHtml(team.dogName) + '</h3>' +
              '<div class="hb-dog-meta">' + escapeHtml(team.dogBreed) + ' · Kurse: <strong>' + escapeHtml(team.activeCourses) + '</strong></div>' +
            '</div>' +
          '</div>' +
          '<div class="hb-streak-badge">' +
            '<strong>' + completedHwCount + ' von ' + team.homework.length + ' Aufgaben fertig</strong>' +
            '<span>' + team.streakDays + ' Tage in Folge drangeblieben</span>' +
          '</div>' +
        '</div>' +
        '<div class="hb-weekly-progress">' +
          '<div class="hb-progress-header">' +
            '<span>Wochenpensum (' + completedRounds + ' von ' + totalRounds + ' Übungsrunden abgehakt)</span>' +
            '<strong>' + pct + '%</strong>' +
          '</div>' +
          '<div class="hb-progress-track">' +
            '<div class="hb-progress-fill ' + (pct === 100 ? "complete" : "") + '" style="width: ' + pct + '%;"></div>' +
          '</div>' +
        '</div>' +
        (team.trainerFeedbackNote
          ? '<div class="hb-trainer-message-box">' +
              '<img src="' + escapeHtml(team.trainerAvatar) + '" alt="' + escapeHtml(team.primaryTrainer) + '" class="hb-trainer-mini-avatar" />' +
              '<div class="hb-trainer-message-content">' +
                '<strong>Rückmeldung von Trainerin ' + escapeHtml(team.primaryTrainer) + '</strong>' +
                '<span>' + escapeHtml(team.trainerFeedbackNote) + '</span>' +
              '</div>' +
            '</div>'
          : "");
    }

    // 2) Render Homework Cards
    const hwListEl = document.getElementById("customerHomeworkList");
    if (!hwListEl) return;

    const moodOptions = [
      "Sehr ruhig & konzentriert",
      "Anfangs aufgeregt, ab Runde 2 ruhig",
      "Größerer Abstand war heute nötig"
    ];

    hwListEl.innerHTML = team.homework.map(function (hw) {
      const doneCount = hw.rounds.filter(function (r) { return r.done; }).length;
      const totalCount = hw.rounds.length;
      const isAllDone = totalCount > 0 && doneCount === totalCount;
      const isSetupOpen = Boolean(expandedSetups[hw.id]);

      const roundsHtml = hw.rounds.map(function (round, idx) {
        return (
          '<div class="hb-round-item ' + (round.done ? "checked" : "") + '" ' +
               'data-action="toggle-round" data-hw-id="' + escapeHtml(hw.id) + '" data-round-id="' + escapeHtml(round.id) + '" ' +
               'role="checkbox" aria-checked="' + (round.done ? "true" : "false") + '" tabindex="0">' +
            '<div class="hb-round-checkbox">' +
              '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>' +
            '</div>' +
            '<div class="hb-round-text">' +
              '<strong>' + escapeHtml(round.label.split(":")[0]) + ':</strong>' +
              escapeHtml(round.label.substring(round.label.indexOf(":") + 1)) +
            '</div>' +
            '<div class="hb-round-status-tag">' +
              (round.done ? (round.doneAt || "Erledigt") : "Offen") +
            '</div>' +
          '</div>'
        );
      }).join("");

      const setupStepsHtml = (hw.setupSteps || []).map(function (step, i) {
        return (
          '<li>' +
            '<span class="hb-step-num">' + (i + 1) + '</span>' +
            '<span>' + escapeHtml(step) + '</span>' +
          '</li>'
        );
      }).join("");

      const moodChipsHtml = moodOptions.map(function (m) {
        const activeClass = hw.clientMood === m ? "active" : "";
        return (
          '<button type="button" class="hb-mood-chip ' + activeClass + '" ' +
                  'data-action="set-mood" data-hw-id="' + escapeHtml(hw.id) + '" data-mood="' + escapeHtml(m) + '">' +
            escapeHtml(m) +
          '</button>'
        );
      }).join("");

      return (
        '<article class="hb-hw-card ' + (hw.featured ? "featured " : "") + (isAllDone ? "completed" : "") + '">' +
          '<div class="hb-hw-top">' +
            '<div class="hb-hw-badges">' +
              '<span class="hb-tag">' + escapeHtml(hw.category) + '</span>' +
              (hw.featured ? '<span class="hb-tag hb-tag-priority">Wochen-Schwerpunkt</span>' : '') +
              (isAllDone ? '<span class="hb-tag hb-tag-done">Hausaufgabe erledigt</span>' : '') +
              '<span style="font-size:0.78rem; color:var(--hb-brown-muted);">Trainerin: ' + escapeHtml(hw.assignedBy) + '</span>' +
            '</div>' +
            '<span class="hb-hw-counter">' + doneCount + ' / ' + totalCount + ' Runden</span>' +
          '</div>' +

          '<h3 class="hb-hw-title">' + escapeHtml(hw.title) + '</h3>' +
          '<p class="hb-hw-summary">' + escapeHtml(hw.summary) + '</p>' +

          '<button type="button" class="hb-setup-toggle" data-action="toggle-setup" data-hw-id="' + escapeHtml(hw.id) + '">' +
            '<span>Erklärung &amp; Übungsaufbau ' + (isSetupOpen ? "ausblenden" : "anzeigen") + '</span>' +
            '<span style="font-size:0.8rem; color:var(--hb-green-dark);">' + (isSetupOpen ? "Schließen" : "Aufklappen") + '</span>' +
          '</button>' +

          '<div class="hb-setup-panel ' + (isSetupOpen ? "" : "hidden") + '">' +
            (hw.hasLilaBlauSketch ? buildLilaBlauTacticalSvg(doneCount, totalCount) : '') +
            '<ul class="hb-setup-steps">' + setupStepsHtml + '</ul>' +
          '</div>' +

          '<div class="hb-rounds-label">' +
            '<span>Einzelne Runden zum Abhaken (Klicken zum Abhaken)</span>' +
            (!isAllDone
              ? '<button type="button" class="hb-btn hb-btn-primary hb-btn-sm" style="padding:0.25rem 0.85rem; font-size:0.78rem;" data-action="complete-all-rounds" data-hw-id="' + escapeHtml(hw.id) + '">' +
                  'Alle ' + totalCount + ' Runden abhaken' +
                '</button>'
              : '<span style="color:var(--hb-green-dark); font-weight:600;">Komplett abgehakt</span>') +
          '</div>' +

          '<div class="hb-rounds-list">' +
            roundsHtml +
          '</div>' +

          '<div class="hb-hw-footer">' +
            '<div class="hb-mood-row">' +
              '<span class="hb-mood-label">Wie lief es mit ' + escapeHtml(team.dogName) + '?</span>' +
              moodChipsHtml +
            '</div>' +
            '<div class="hb-note-row">' +
              '<input type="text" class="hb-input" id="noteInput_' + escapeHtml(hw.id) + '" ' +
                     'value="' + escapeHtml(hw.clientNote || "") + '" ' +
                     'placeholder="Kurze Notiz für Trainerin ' + escapeHtml(hw.assignedBy) + ' (z.B. Abstand, Leine, Besonderheiten)..." />' +
              '<button type="button" class="hb-btn hb-btn-green hb-btn-sm" data-action="save-note" data-hw-id="' + escapeHtml(hw.id) + '">' +
                'Notiz speichern' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }).join("");
  }

  // ==========================================================================
  // 7. RENDER TRAINER COCKPIT PANE (Dominika, Saskia & Martina)
  // ==========================================================================
  function renderTrainerPane() {
    // Compute global KPIs across all teams
    let totalRoundsDone = 0;
    let totalRoundsAll = 0;
    let completedExercises = 0;
    let totalExercises = 0;

    Object.keys(appState.teams).forEach(function (teamKey) {
      const t = appState.teams[teamKey];
      t.homework.forEach(function (hw) {
        totalExercises += 1;
        const done = hw.rounds.filter(function (r) { return r.done; }).length;
        totalRoundsDone += done;
        totalRoundsAll += hw.rounds.length;
        if (hw.rounds.length > 0 && done === hw.rounds.length) {
          completedExercises += 1;
        }
      });
    });

    const kpiEl = document.getElementById("trainerKpiRow");
    if (kpiEl) {
      kpiEl.innerHTML =
        '<div class="hb-kpi-box">' +
          '<strong>' + totalRoundsDone + ' / ' + totalRoundsAll + '</strong>' +
          '<span>Abgehakte Runden gesamt</span>' +
        '</div>' +
        '<div class="hb-kpi-box">' +
          '<strong>' + completedExercises + ' von ' + totalExercises + '</strong>' +
          '<span>Hausaufgaben komplett</span>' +
        '</div>' +
        '<div class="hb-kpi-box">' +
          '<strong>' + appState.activityFeed.length + '</strong>' +
          '<span>Live-Einträge im Protokoll</span>' +
        '</div>';
    }

    // Render Live Activity Feed
    const feedEl = document.getElementById("trainerActivityFeed");
    if (feedEl) {
      feedEl.innerHTML = appState.activityFeed.map(function (item, idx) {
        return (
          '<div class="hb-feed-item ' + (idx === 0 || item.highlight ? "highlight" : "") + '">' +
            '<div class="hb-feed-item-top">' +
              '<strong>' + escapeHtml(item.teamName) + ' · ' + escapeHtml(item.category) + '</strong>' +
              '<span>' + escapeHtml(item.timestamp) + '</span>' +
            '</div>' +
            '<div class="hb-feed-item-body">' + escapeHtml(item.text) + '</div>' +
          '</div>'
        );
      }).join("");
    }

    // Render Clients Overview with Round Dots & Quick Praise Input
    const clientsEl = document.getElementById("trainerClientsOverview");
    if (clientsEl) {
      const orderedKeys = ["paul_fifi", "julia_balu", "markus_lotte"];
      clientsEl.innerHTML = orderedKeys.map(function (tKey) {
        const team = appState.teams[tKey];
        if (!team) return "";
        const isCurrent = tKey === activeTeamId;

        const hwRowsHtml = team.homework.map(function (hw) {
          const doneCount = hw.rounds.filter(function (r) { return r.done; }).length;
          const dotsHtml = hw.rounds.map(function (r) {
            return '<span class="hb-mini-dot ' + (r.done ? "done" : "") + '" title="' + escapeHtml(r.label) + '"></span>';
          }).join("");

          return (
            '<div class="hb-trainer-hw-mini">' +
              '<div>' +
                '<strong style="display:block; color:var(--hb-brown);">' + escapeHtml(hw.title) + '</strong>' +
                '<span style="font-size:0.78rem; color:var(--hb-brown-muted);">' +
                  escapeHtml(hw.category) +
                  (hw.clientMood ? ' · Rückmeldung: ' + escapeHtml(hw.clientMood) : '') +
                  (hw.clientNote ? ' · "' + escapeHtml(hw.clientNote) + '"' : '') +
                '</span>' +
              '</div>' +
              '<div style="display:flex; align-items:center; gap:0.55rem;">' +
                '<div class="hb-mini-dots">' + dotsHtml + '</div>' +
                '<span style="font-size:0.8rem; font-weight:600; min-width:34px; text-align:right;">' +
                  doneCount + '/' + hw.rounds.length +
                '</span>' +
              '</div>' +
            '</div>'
          );
        }).join("");

        return (
          '<div class="hb-trainer-client-card ' + (isCurrent ? "active-client" : "") + '">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.6rem;">' +
              '<div style="display:flex; align-items:center; gap:0.65rem;">' +
                '<img src="' + escapeHtml(team.avatar) + '" alt="" style="width:38px; height:38px; border-radius:50%; object-fit:cover;" />' +
                '<div>' +
                  '<strong style="font-size:1.02rem;">' + escapeHtml(team.ownerName) + ' &amp; ' + escapeHtml(team.dogName) + '</strong>' +
                  '<div style="font-size:0.78rem; color:var(--hb-brown-muted);">Betreut von ' + escapeHtml(team.primaryTrainer) + '</div>' +
                '</div>' +
              '</div>' +
              (isCurrent
                ? '<span class="hb-tag">Links geöffnet</span>'
                : '<button type="button" class="hb-btn hb-btn-outline hb-btn-sm" style="padding:0.25rem 0.75rem; font-size:0.76rem;" data-action="select-team" data-team-id="' + escapeHtml(tKey) + '">In Kunden-App öffnen</button>') +
            '</div>' +
            '<div>' + hwRowsHtml + '</div>' +
            '<div style="margin-top:0.75rem; padding-top:0.65rem; border-top:1px solid rgba(45,35,25,0.08); display:flex; gap:0.45rem;">' +
              '<input type="text" class="hb-input" id="trainerReply_' + escapeHtml(tKey) + '" ' +
                     'placeholder="Motivation / Tipp von ' + escapeHtml(team.primaryTrainer) + ' an ' + escapeHtml(team.ownerName) + ' senden..." />' +
              '<button type="button" class="hb-btn hb-btn-green hb-btn-sm" data-action="send-trainer-feedback" data-team-id="' + escapeHtml(tKey) + '">' +
                'Senden' +
              '</button>' +
            '</div>' +
          '</div>'
        );
      }).join("");
    }
  }

  // ==========================================================================
  // 8. RENDER COURSE CATALOG ("Entfalte dein ganzes Pfotenzial!")
  // ==========================================================================
  function renderCourseCatalog() {
    const gridEl = document.getElementById("courseCatalogGrid");
    if (!gridEl) return;

    const currentTeam = appState.teams[activeTeamId] || appState.teams.paul_fifi;

    gridEl.innerHTML = HUNDEBERG_COURSES.map(function (course) {
      const exListHtml = course.exercises.map(function (ex) {
        return '<li>' + escapeHtml(ex) + '</li>';
      }).join("");

      return (
        '<article class="hb-course-card">' +
          '<div>' +
            '<img src="' + escapeHtml(course.image) + '" alt="' + escapeHtml(course.title) + '" class="hb-course-thumb" loading="lazy" />' +
            '<h3>' + escapeHtml(course.title) + '</h3>' +
            '<p class="hb-course-desc">' + escapeHtml(course.desc) + '</p>' +
            '<div class="hb-course-exercises">' +
              '<div class="hb-course-exercises-title">Typische Hausaufgaben in der App</div>' +
              '<ul>' + exListHtml + '</ul>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="hb-btn hb-btn-primary" style="width:100%;" data-action="adopt-course-template" data-course-id="' + escapeHtml(course.id) + '">' +
            'Übung für ' + escapeHtml(currentTeam.ownerName) + ' &amp; ' + escapeHtml(currentTeam.dogName) + ' übernehmen' +
          '</button>' +
        '</article>'
      );
    }).join("");
  }

  function renderAll() {
    renderCustomerPane();
    renderTrainerPane();
    renderCourseCatalog();
  }

  // ==========================================================================
  // 9. INTERACTION HANDLERS
  // ==========================================================================
  function handleToggleRound(hwId, roundId) {
    const team = appState.teams[activeTeamId];
    if (!team) return;
    const hw = team.homework.find(function (h) { return h.id === hwId; });
    if (!hw) return;
    const round = hw.rounds.find(function (r) { return r.id === roundId; });
    if (!round) return;

    round.done = !round.done;
    round.doneAt = round.done ? formatNowTime() : null;

    const doneCount = hw.rounds.filter(function (r) { return r.done; }).length;
    const totalCount = hw.rounds.length;
    const roundNumber = hw.rounds.indexOf(round) + 1;

    if (round.done) {
      if (doneCount === totalCount) {
        addActivityEvent(
          team.ownerName + " & " + team.dogName,
          hw.category,
          team.ownerName + " hat mit " + team.dogName + " alle " + totalCount + " Runden bei '" + hw.title + "' vollständig abgeschlossen!",
          true
        );
        showToast("Alle " + totalCount + " Runden erledigt! Trainerin " + hw.assignedBy + " sieht deinen Abschluss jetzt live.");
      } else {
        addActivityEvent(
          team.ownerName + " & " + team.dogName,
          hw.category,
          team.ownerName + " hat mit " + team.dogName + " Runde " + roundNumber + " (" + doneCount + "/" + totalCount + ") bei '" + hw.title + "' abgehakt.",
          true
        );
        showToast("Runde " + roundNumber + " abgehakt (" + doneCount + " von " + totalCount + ") – im Trainer-Cockpit aktualisiert.");
      }
    } else {
      addActivityEvent(
        team.ownerName + " & " + team.dogName,
        hw.category,
        "Runde " + roundNumber + " bei '" + hw.title + "' wieder als offen markiert (" + doneCount + "/" + totalCount + ").",
        false
      );
    }

    pushStateToFirebase("Runden-Status aktualisiert");
  }

  function handleCompleteAllRounds(hwId) {
    const team = appState.teams[activeTeamId];
    if (!team) return;
    const hw = team.homework.find(function (h) { return h.id === hwId; });
    if (!hw) return;

    const nowLabel = formatNowTime();
    hw.rounds.forEach(function (r) {
      r.done = true;
      if (!r.doneAt) r.doneAt = nowLabel;
    });

    addActivityEvent(
      team.ownerName + " & " + team.dogName,
      hw.category,
      team.ownerName + " hat mit " + team.dogName + " alle " + hw.rounds.length + " Runden der Hausaufgabe '" + hw.title + "' erledigt!",
      true
    );

    showToast("Hausaufgabe '" + hw.title + "' komplett abgehakt!");
    pushStateToFirebase("Alle Runden abgehakt");
  }

  function handleSetMood(hwId, mood) {
    const team = appState.teams[activeTeamId];
    if (!team) return;
    const hw = team.homework.find(function (h) { return h.id === hwId; });
    if (!hw) return;

    hw.clientMood = mood;
    addActivityEvent(
      team.ownerName + " & " + team.dogName,
      hw.category,
      team.ownerName + " bewertet das Training '" + hw.title + "' mit " + team.dogName + ": " + mood + ".",
      false
    );
    showToast("Einschätzung gespeichert und an Trainerin " + hw.assignedBy + " übertragen.");
    pushStateToFirebase("Stimmungs-Feedback gespeichert");
  }

  function handleSaveNote(hwId) {
    const team = appState.teams[activeTeamId];
    if (!team) return;
    const hw = team.homework.find(function (h) { return h.id === hwId; });
    if (!hw) return;

    const inputEl = document.getElementById("noteInput_" + hwId);
    if (!inputEl) return;
    const noteText = inputEl.value.trim();
    hw.clientNote = noteText;

    if (noteText) {
      addActivityEvent(
        team.ownerName + " & " + team.dogName,
        hw.category,
        "Notiz von " + team.ownerName + " zu '" + hw.title + "': \"" + noteText + "\"",
        true
      );
      showToast("Notiz für Trainerin " + hw.assignedBy + " gespeichert.");
    } else {
      showToast("Notiz aktualisiert.");
    }
    pushStateToFirebase("Kunden-Notiz gespeichert");
  }

  function handleSendTrainerFeedback(teamId) {
    const team = appState.teams[teamId];
    if (!team) return;
    const inputEl = document.getElementById("trainerReply_" + teamId);
    if (!inputEl || !inputEl.value.trim()) return;

    const msg = inputEl.value.trim();
    team.trainerFeedbackNote = msg;
    inputEl.value = "";

    addActivityEvent(
      "Trainerin " + team.primaryTrainer,
      "Rückmeldung an " + team.ownerName,
      team.primaryTrainer + " schrieb an " + team.ownerName + " & " + team.dogName + ": \"" + msg + "\"",
      true
    );

    showToast("Rückmeldung von " + team.primaryTrainer + " erscheint jetzt direkt in " + team.ownerName + "s App.");
    pushStateToFirebase("Trainer-Feedback gesendet");
  }

  function handleAdoptCourseTemplate(courseId) {
    const course = HUNDEBERG_COURSES.find(function (c) { return c.id === courseId; });
    const team = appState.teams[activeTeamId];
    if (!course || !course.templateHw || !team) return;

    const tpl = course.templateHw;
    const newHwId = "hw_tpl_" + Date.now();
    const newHw = {
      id: newHwId,
      title: tpl.title,
      category: tpl.category,
      assignedBy: tpl.assignedBy,
      featured: false,
      hasLilaBlauSketch: false,
      summary: tpl.summary,
      setupSteps: tpl.setupSteps.slice(),
      rounds: tpl.roundsLabels.map(function (lbl, idx) {
        return {
          id: "r_" + idx + "_" + Date.now(),
          label: lbl,
          done: false,
          doneAt: null
        };
      }),
      clientMood: "",
      clientNote: ""
    };

    team.homework.unshift(newHw);
    expandedSetups[newHwId] = true;

    addActivityEvent(
      team.ownerName + " & " + team.dogName,
      tpl.category,
      "Neue Übung '" + tpl.title + "' aus dem Hundeberg-Katalog zum Trainingsheft hinzugefügt.",
      true
    );

    pushStateToFirebase("Vorlage übernommen");
    showToast("Übung '" + tpl.title + "' wurde zu " + team.ownerName + " & " + team.dogName + " hinzugefügt.");

    const previewSection = document.getElementById("app-vorschau");
    if (previewSection) {
      previewSection.scrollIntoView({ behavior: "smooth" });
    }
  }

  // ==========================================================================
  // 10. EVENT LISTENERS & INITIALIZATION
  // ==========================================================================
  function bindEvents() {
    // View Mode Tabs
    const viewTabs = document.querySelectorAll("[data-view-mode]");
    const appStage = document.getElementById("appStage");

    viewTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        const mode = tab.getAttribute("data-view-mode");
        activeViewMode = mode;
        viewTabs.forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        if (appStage) {
          appStage.className = "hb-app-stage mode-" + mode;
        }
      });
    });

    // Team Selector Dropdown
    const teamSelect = document.getElementById("teamSelect");
    if (teamSelect) {
      teamSelect.addEventListener("change", function () {
        activeTeamId = teamSelect.value;
        renderAll();
        showToast("Ansicht gewechselt auf " + appState.teams[activeTeamId].ownerName + " & " + appState.teams[activeTeamId].dogName);
      });
    }

    // Reset Demo Button
    const resetBtn = document.getElementById("resetDemoBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        appState = createDefaultState();
        expandedSetups = { "hw_lila_blau": true };
        activeTeamId = "paul_fifi";
        if (teamSelect) teamSelect.value = "paul_fifi";
        pushStateToFirebase("Demo-Stand zurückgesetzt");
        showToast("Prototyp auf den Ausgangsstand (Paul & Fifi bei Lila-Blau) zurückgesetzt.");
      });
    }

    // Delegated Clicks inside Customer, Trainer & Catalog Panes
    document.body.addEventListener("click", function (ev) {
      const target = ev.target.closest("[data-action]");
      if (!target) return;

      const action = target.getAttribute("data-action");
      const hwId = target.getAttribute("data-hw-id");

      if (action === "toggle-round") {
        const roundId = target.getAttribute("data-round-id");
        handleToggleRound(hwId, roundId);
      } else if (action === "complete-all-rounds") {
        handleCompleteAllRounds(hwId);
      } else if (action === "toggle-setup") {
        expandedSetups[hwId] = !expandedSetups[hwId];
        renderCustomerPane();
      } else if (action === "set-mood") {
        const mood = target.getAttribute("data-mood");
        handleSetMood(hwId, mood);
      } else if (action === "save-note") {
        handleSaveNote(hwId);
      } else if (action === "select-team") {
        const tId = target.getAttribute("data-team-id");
        if (tId && appState.teams[tId]) {
          activeTeamId = tId;
          if (teamSelect) teamSelect.value = tId;
          renderAll();
        }
      } else if (action === "send-trainer-feedback") {
        const tId = target.getAttribute("data-team-id");
        handleSendTrainerFeedback(tId);
      } else if (action === "adopt-course-template") {
        const courseId = target.getAttribute("data-course-id");
        handleAdoptCourseTemplate(courseId);
      }
    });

    // Keyboard accessibility for round checkboxes
    document.body.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        const roundItem = ev.target.closest('[data-action="toggle-round"]');
        if (roundItem) {
          ev.preventDefault();
          handleToggleRound(
            roundItem.getAttribute("data-hw-id"),
            roundItem.getAttribute("data-round-id")
          );
        }
      }
    });

    // Self-Training Form ("Wenn die Kundschaft selber da was machen kann")
    const selfForm = document.getElementById("selfTrainingForm");
    if (selfForm) {
      selfForm.addEventListener("submit", function (ev) {
        ev.preventDefault();
        const team = appState.teams[activeTeamId];
        if (!team) return;

        const catEl = document.getElementById("selfTrainCategory");
        const roundsEl = document.getElementById("selfTrainRounds");
        const descEl = document.getElementById("selfTrainDescription");

        const category = catEl ? catEl.value : "Freies Training";
        const roundsInfo = roundsEl ? roundsEl.value : "Erledigt";
        const description = descEl ? descEl.value.trim() : "";
        if (!description) return;

        const newSelfHw = {
          id: "hw_self_" + Date.now(),
          title: "Eigenes Training: " + description,
          category: category + " (Selbstständig)",
          assignedBy: team.ownerName + " (Eigeninitiative)",
          featured: false,
          hasLilaBlauSketch: false,
          summary: "Selbstständig durchgeführte Trainingseinheit von " + team.ownerName + " mit " + team.dogName + " (" + roundsInfo + ").",
          setupSteps: [
            "Eigenständige Wiederholung nach dem Hundeberg-Trainingsprinzip im Alltag.",
            "Umfang: " + roundsInfo
          ],
          rounds: [
            {
              id: "sr_1_" + Date.now(),
              label: "Einheit durchgeführt: " + description + " (" + roundsInfo + ")",
              done: true,
              doneAt: formatNowTime()
            }
          ],
          clientMood: "Sehr ruhig & konzentriert",
          clientNote: "Selbstständig im Alltag geübt und eingetragen."
        };

        team.homework.unshift(newSelfHw);
        team.streakDays = (team.streakDays || 1) + 1;

        addActivityEvent(
          team.ownerName + " & " + team.dogName,
          category + " (Eigentraining)",
          team.ownerName + " hat selbstständig mit " + team.dogName + " geübt: \"" + description + "\" (" + roundsInfo + ").",
          true
        );

        if (descEl) descEl.value = "";
        pushStateToFirebase("Eigenes Training eingetragen");
        showToast("Stark! Dein eigenes Training mit " + team.dogName + " ist jetzt im Trainer-Cockpit sichtbar.");
      });
    }

    // Trainer Assign New Homework Form
    const assignForm = document.getElementById("assignHomeworkForm");
    if (assignForm) {
      assignForm.addEventListener("submit", function (ev) {
        ev.preventDefault();
        const team = appState.teams[activeTeamId];
        if (!team) return;

        const titleEl = document.getElementById("assignHwTitle");
        const catEl = document.getElementById("assignHwCategory");
        const countEl = document.getElementById("assignHwRoundsCount");
        const trainerEl = document.getElementById("assignHwTrainer");
        const setupEl = document.getElementById("assignHwSetup");

        const title = titleEl ? titleEl.value.trim() : "";
        const category = catEl ? catEl.value : "Alltagstraining";
        const roundsCount = parseInt(countEl ? countEl.value : "5", 10) || 5;
        const trainer = trainerEl ? trainerEl.value : "Dominika";
        const setupText = setupEl ? setupEl.value.trim() : "";

        if (!title || !setupText) return;

        const roundsArr = [];
        for (let i = 1; i <= roundsCount; i++) {
          roundsArr.push({
            id: "ar_" + i + "_" + Date.now(),
            label: "Runde " + i + ": " + title + " – ruhig und konzentriert ausführen.",
            done: false,
            doneAt: null
          });
        }

        const newHwId = "hw_assigned_" + Date.now();
        team.homework.unshift({
          id: newHwId,
          title: title,
          category: category,
          assignedBy: trainer,
          featured: true,
          hasLilaBlauSketch: false,
          summary: setupText,
          setupSteps: [
            setupText,
            "Achte auf eine lockere Leine, ruhige Körpersprache und rechtzeitige Belohnung nach jeder Runde."
          ],
          rounds: roundsArr,
          clientMood: "",
          clientNote: ""
        });

        expandedSetups[newHwId] = true;

        addActivityEvent(
          "Trainerin " + trainer,
          "Neue Hausaufgabe",
          trainer + " hat " + team.ownerName + " & " + team.dogName + " die Aufgabe '" + title + "' (" + roundsCount + " Runden) zugewiesen.",
          true
        );

        if (titleEl) titleEl.value = "";
        if (setupEl) setupEl.value = "";

        pushStateToFirebase("Neue Hausaufgabe zugewiesen");
        showToast("Hausaufgabe '" + title + "' wurde live an " + team.ownerName + " & " + team.dogName + " gesendet.");
      });
    }
  }

  // Boot
  document.addEventListener("DOMContentLoaded", function () {
    renderAll();
    bindEvents();
    initFirebase();
  });
})();
