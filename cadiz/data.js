/**
 * Cádiz Explorer & Rallye – Kompletter Datensatz
 * 7 Chronologische Hauptstationen + 12 Live-Radar POIs (Tapas, Hidden Gems, Sehenswertes, Parken)
 */

window.CADIZ_DATA = {
  fallbackCoords: {
    lat: 36.5290,
    lng: -6.2952,
    label: 'Catedral de Cádiz (Zentrum)'
  },

  stations: [
    {
      id: 'station-1',
      number: 1,
      title: 'Station 1: Barrio del Pópulo & Teatro Romano',
      shortTitle: 'Barrio del Pópulo & Teatro Romano',
      badge: '🏛️ Altstadt & Antike',
      category: 'Sehenswertes',
      lat: 36.5284,
      lng: -6.2937,
      story:
        'Ihr steht im ältesten Viertel Westeuropas! Zwischen den drei mittelalterlichen Steinbögen aus dem 13. Jahrhundert (Arco de la Rosa, Arco del Pópulo, Arco de los Blancos) versteckt sich das gigantische Römische Theater aus dem 1. Jh. v. Chr. Kurios: Es wurde erst 1980 durch Zufall entdeckt, als alte Lagerhäuser abgerissen wurden. Mit Platz für 10.000 Zuschauer war es eines der größten im gesamten Römischen Reich.',
      question:
        'In welchem Jahr gründeten die Phönizier die Stadt Cádiz (damals Gadir) laut Geschichtsschreibung?',
      answer:
        'Ca. 1100 v. Chr. (genauer: 1104 v. Chr.) – Cádiz hat also über 3.100 Jahre auf dem Buckel!',
      radarWhy:
        'Ältestes Viertel Westeuropas mit drei mittelalterlichen Torbögen & riesigem Römischen Theater (Eintritt frei!).',
      radarMustSee:
        'Arco de la Rosa, Römisches Theater & eingemauerte Kanonenrohre an den Gassen-Ecken.',
      tasks: [
        {
          id: 's1_t1',
          points: 10,
          title: 'Die Gassen-Kette',
          description:
            'Sucht eine der engsten Gassen oder einen der drei mittelalterlichen Torbögen. Bildet eine Menschenkette von Hauswand zu Hauswand und macht ein Beweisfoto!'
        },
        {
          id: 's1_t2',
          points: 5,
          title: 'Kanonen-Eckschutz',
          description:
            'Findet an einer alten Hausecke ein eingemauertes Kanonenrohr oder eine Kugel (schützte früher die Ecken vor Kutschenrädern) und posiert als Stadtwache.'
        }
      ]
    },
    {
      id: 'station-2',
      number: 2,
      title: 'Station 2: Catedral de Cádiz (Catedral Nueva)',
      shortTitle: 'Catedral de Cádiz',
      badge: '✨ Kathedrale & Goldkuppel',
      category: 'Sehenswertes',
      lat: 36.5290,
      lng: -6.2952,
      story:
        'Die „Kathedrale zum heiligen Kreuze über dem Meer“ wurde ab 1722 gebaut – allerdings ging der Stadt nach dem Verlust des Handelsmonopols das Geld aus. Nach 116 Jahren Bauzeit sieht man deshalb drei Stile übereinander: Barock unten, Rokoko in der Mitte und Neoklassizismus an den Türmen. Die berühmte goldene Kuppel besteht aus Tausenden glasierten Keramikfliesen. Unten in der Krypta (unter dem Meeresspiegel!) gibt es ein irres akustisches Echo.',
      question:
        'Wie viele Meter ragt der höchste Punkt des westlichen Glockenturms (Torre de Poniente) über den Meeresspiegel hinaus?',
      answer:
        'Exakt 58 Meter über dem Meeresspiegel (ca. 45 Meter ab Platzhöhe).',
      radarWhy:
        'Das goldglänzende Wahrzeichen von Cádiz direkt am Atlantik mit 116 Jahren Baugeschichte.',
      radarMustSee:
        'Goldene Keramikkuppel, Uhrturm (Torre del Reloj), Echo-Krypta unter dem Meeresspiegel & Blick vom Campo del Sur.',
      tasks: [
        {
          id: 's2_t1',
          points: 10,
          title: 'Kuppel-Akrobatik',
          description:
            'Schießt auf dem Platz ein Foto mit erzwungener Perspektive, auf dem jemand die goldene Kuppel wie eine Eiskugel auf der Hand balanciert oder mit zwei Fingern festhält.'
        },
        {
          id: 's2_t2',
          points: 10,
          title: 'Der Höhen-Bonus',
          description:
            'Entweder ihr steigt auf den Uhrturm (Torre del Reloj) ODER ihr findet auf der Rückseite zum Meer (Campo del Sur) den besten Blickwinkel, bei dem Kathedrale und Atlantik-Wellen auf einem Bild sind.'
        }
      ]
    },
    {
      id: 'station-3',
      number: 3,
      title: 'Station 3: Torre Tavira',
      shortTitle: 'Torre Tavira',
      badge: '🔭 Wachturm & Panorama',
      category: 'Sehenswertes',
      lat: 36.5316,
      lng: -6.2982,
      story:
        'Im 18. Jahrhundert hatte Cádiz über 160 private Wachtürme auf den Dächern der Kaufmannspaläste, um einlaufende Schiffe mit Gold, Silber und Gewürzen aus Amerika per Fernrohr als Erster zu erspähen. Der Torre Tavira liegt auf dem höchsten natürlichen Punkt der Altstadt (45 m ü. NN) und wurde 1778 zum offiziellen Wachturm des Hafens ernannt. Im Inneren projiziert eine „Camera Obscura“ über Spiegel und Linsen ein Live-360°-Bild der Stadt auf eine weiße Schale.',
      question:
        'Wie viele Stufen muss man im Torre Tavira bis zur Aussichtsplattform hinaufsteigen?',
      answer: '173 Stufen!',
      radarWhy:
        'Höchster natürlicher Punkt der Altstadt (45 m ü. NN) und historischer Haupt-Wachturm der Silberflotte.',
      radarMustSee:
        'Camera Obscura Live-Projektion & 360°-Dächerpanorama über die 160 Wachtürme von Cádiz.',
      tasks: [
        {
          id: 's3_t1',
          points: 15,
          title: 'Späher-Challenge',
          description:
            'Entdeckt beim Laufen durch die Gassen (oder von oben) mindestens 3 weitere historische Wachtürme auf den Nachbardächern von Cádiz und haltet sie im Bild fest.'
        },
        {
          id: 's3_t2',
          points: 5,
          title: 'Land in Sicht',
          description:
            'Stellt vor dem Turm eine dramatische Szene nach, in der eure Crew mit imaginären Fernrohren ein Piratenschiff am Horizont erspäht.'
        }
      ]
    },
    {
      id: 'station-4',
      number: 4,
      title: 'Station 4: Mercado Central de Abastos',
      shortTitle: 'Mercado Central de Abastos',
      badge: '🍤 Markt & Kulinarik',
      category: 'Sehenswertes',
      lat: 36.5303,
      lng: -6.2987,
      story:
        '1838 im neoklassizistischen Stil mit dorischen Kolonnaden auf dem ehemaligen Klostergarten des Convento de los Descalzos eröffnet. Vormittags bis ca. 14:00 Uhr tobt innen der legendäre Fischmarkt (inklusive riesigem Almadraba-Thunfisch), während im „Rincón Gastronómico“ bis ca. 16:30 Uhr (und wieder ab 20:00 Uhr) Tapas, frittierte Meeresfrüchte und kaltes Bier gereicht werden. Direkt daneben liegt die bunte Plaza de las Flores!',
      question:
        'Woraus bestehen die berühmten „Tortillitas de Camarones“, die Nationalspezialität von Cádiz?',
      answer:
        'Ein hauchdünner, knusprig ausgebackener Teig aus Kichererbsenmehl, Weizenmehl, Wasser, Zwiebeln, Petersilie und winzigen ganzen Nordsee-/Atlantik-Krabben (Camarones) – komplett ohne Ei!',
      radarWhy:
        'Historische Markthalle mit dorischen Säulen, spektakulärem Fischmarkt & Rincón Gastronómico.',
      radarMustSee:
        'Tortillitas de Camarones, roter Almadraba-Thunfisch, Chicharrones & die bunte Plaza de las Flores direkt nebenan.',
      tasks: [
        {
          id: 's4_t1',
          points: 15,
          title: 'Tapas-Blindverkostung',
          description:
            'Einer besorgt eine lokale Spezialität (z. B. Tortillitas de Camarones, Chicharrones oder Pescaíto frito). Ein Gruppenmitglied muss mit geschlossenen Augen probieren und die Zutaten erraten!'
        },
        {
          id: 's4_t2',
          points: 10,
          title: 'No Hablo Alemán',
          description:
            'Bestellt eine Runde Essen oder Getränke zu 100 % auf Spanisch (kein Wort Deutsch oder Englisch erlaubt!).'
        }
      ]
    },
    {
      id: 'station-5',
      number: 5,
      title: 'Station 5: Barrio de La Viña & Playa de La Caleta',
      shortTitle: 'La Viña & Playa de La Caleta',
      badge: '🏖️ Strand & 007-Drehort',
      category: 'Sehenswertes',
      lat: 36.5303,
      lng: -6.3056,
      story:
        'Ihr lauft durch das ehemalige Fischer- und Karnevalsviertel La Viña direkt zur Bucht La Caleta. Schon Phönizier und Römer nutzten diesen geschützten Kanal zwischen den Riffen als Hafen. Das strahlend weiße Holzgebäude am Strand ist das historische Kurbad Balneario de Nuestra Señora de la Palma y del Real (1926). Hollywood-Fakt: Hier stieg Halle Berry als Jinx im James-Bond-Film „Stirb an einem anderen Tag“ aus den Wellen – Cádiz musste im Film als Havanna (Kuba) herhalten!',
      question:
        'Aus welchem Jahr stammt das weiße historische Badehaus (Balneario de la Palma), das den Strand dominiert?',
      answer: '1926!',
      radarWhy:
        'Malerische Stadtbucht zwischen zwei Festungen, buntes Fischerboot-Flair & echter James-Bond-Drehort.',
      radarMustSee:
        'Weißes Kurbad Balneario de la Palma (1926), bunte Fischerboote & ein Fußbad im Atlantik.',
      tasks: [
        {
          id: 's5_t1',
          points: 15,
          title: '007-Slow-Motion',
          description:
            'Dreht ein kurzes Zeitlupen-Video am Wasser: Eine Person schreitet in dramatischer James-Bond-Manier am Strand entlang, während der Rest im Vordergrund wie Geheimagenten aus der Deckung „observiert“.'
        },
        {
          id: 's5_t2',
          points: 5,
          title: 'Atlantik-Temperatur-Check',
          description:
            'Jeder tippt die Wassertemperatur, bevor mindestens eine Person mit der Hand (oder den Füßen) den echten Atlantik-Test macht.'
        }
      ]
    },
    {
      id: 'station-6',
      number: 6,
      title: 'Station 6: Castillo de Santa Catalina',
      shortTitle: 'Castillo de Santa Catalina',
      badge: '🏰 Sternfestung am Riff',
      category: 'Sehenswertes',
      lat: 36.5327,
      lng: -6.3082,
      story:
        'Nach der verheerenden Plünderung von Cádiz durch eine englisch-niederländische Flotte im Jahr 1596 befahl König Philipp II. den sofortigen Bau dieser sternförmigen Festung (ab 1598). Die zackige Architektur folgt reiner Militär-Geometrie der Renaissance: Von jeder Bastionsflanke konnte die Nachbarmauer bestrichen werden, sodass es für Angreifer keinen einzigen toten Winkel gab. Später diente die Anlage als Militärgefängnis; heute ist der Eintritt frei!',
      question:
        'Wie viele Zacken/Spitzen hat das Castillo de Santa Catalina auf der Land- und Meerseite insgesamt, die ihm seine Sternform geben?',
      answer:
        '3 markante landseitige Bastionsspitzen (Halbbastionen + zentrale Bastion) plus die gezackte Seefront ins Riff hinaus.',
      radarWhy:
        'Sternförmige Renaissance-Festung von 1598 direkt auf den Atlantik-Klippen (Eintritt kostenlos!).',
      radarMustSee:
        'Die äußeren Bastions-Spitzen über dem Meer mit perfektem Blick über die gesamte La-Caleta-Bucht.',
      tasks: [
        {
          id: 's6_t1',
          points: 10,
          title: 'Das 360°-Plakat',
          description:
            'Stellt euch auf einer der äußeren Bastions-Spitzen über dem Meer Rücken an Rücken auf (Blick in alle Himmelsrichtungen wie ein menschliches Radar) und schießt das offizielle Action-Filmplakat eurer Reisegruppe.'
        }
      ]
    },
    {
      id: 'station-7',
      number: 7,
      title: 'Station 7: Parque Genovés & Paseo de Santa Bárbara',
      shortTitle: 'Parque Genovés',
      badge: '🌴 Botanik, Grotte & Finale',
      category: 'Sehenswertes',
      lat: 36.5364,
      lng: -6.3032,
      story:
        'Ende des 19. Jahrhunderts vom Gärtner Gerónimo Genovés i Puig angelegt, beherbergt dieser botanische Garten über 100 exotische Baum- und Straucharten, die Schiffe aus der Neuen Welt und von den Kanaren mitbrachten (darunter ein uralter kanarischer Drachenbaum). Berühmt ist der Park für seine skurril geometrisch geschnittenen Zypressen-Alleen und die künstliche Tropfsteingrotte („La Gruta“) mit Wasserfall, Teich und Dinosaurier-Skulpturen.',
      question:
        'Über wie viele verschiedene Baum- und Pflanzenarten aus aller Welt wachsen im Parque Genovés?',
      answer: 'Über 100 verschiedene Arten!',
      radarWhy:
        'Schattiger botanischer Garten direkt am Meer mit skurrilen Formschnitt-Zypressen, Drachenbaum & Wasserfall-Grotte.',
      radarMustSee:
        'Tropfsteingrotte „La Gruta“ (Höhle hinter dem Wasserfall!), Dino-Teich & geometrische Zypressen-Allee.',
      tasks: [
        {
          id: 's7_t1',
          points: 10,
          title: 'Botanischer Doppelgänger',
          description:
            'Sucht euch einen der skurril zurechtgeschnittenen Bäume oder den Drachenbaum und ahmt seine Form mit eurem Körper möglichst originalgetreu auf einem Foto nach.'
        },
        {
          id: 's7_t2',
          points: 10,
          title: 'Grotten-Finale',
          description:
            'Findet den Wasserfall mit der Grotte (und den Dinos im Wasser), betretet die Höhle hinter dem Wasserfall und kürt dort den Gesamtsieger der Rallye!'
        }
      ]
    }
  ],

  pois: [
    {
      id: 'poi-1',
      title: 'Casa Manteca',
      lat: 36.5310,
      lng: -6.3033,
      category: 'Tapas & Eis',
      info: 'Kult-Taverne im Viertel La Viña seit 1953 mit Stierkampf- und Flamenco-Relikten an den Wänden.',
      tip: 'Unbedingt Chicharrones Especiales (hauchdünn geschnittener, gewürzter Schweinebauch mit Zitrone und Meersalz) bestellen – wird traditionell direkt auf braunem Wachspapier serviert!'
    },
    {
      id: 'poi-2',
      title: 'Freiduría Las Flores',
      lat: 36.5309,
      lng: -6.2979,
      category: 'Tapas & Eis',
      info: 'Direkt an der schönen Plaza Topete (Blumenplatz) neben der Markthalle.',
      tip: 'Holt euch im Vorbeigehen einen Cartucho de Pescaíto Frito (frisch frittierte Meeresfrüchte wie Cazón en Adobo oder Chocos in der Papiertüte zum Mitnehmen).'
    },
    {
      id: 'poi-3',
      title: 'Taberna El Tío de la Tiza',
      lat: 36.5312,
      lng: -6.2995,
      category: 'Tapas & Eis',
      info: 'Wunderschöner, entspannter Platz (Plaza de la Tía Norica) mitten in den Gassen.',
      tip: 'Perfekt für gegrillten Thunfisch (Atún de Almadraba) und gebratene Paprika in der Sonne.'
    },
    {
      id: 'poi-4',
      title: 'Heladería Los Italianos / Calle Ancha',
      lat: 36.5337,
      lng: -6.2980,
      category: 'Tapas & Eis',
      info: 'Die eleganteste Flaniermeile der Altstadt (Calle Ancha) mit traditionsreichen Cafés und Eisdielen.',
      tip: 'Perfekter Zwischenstopp für Café con Leche, Churros oder ein Eis auf dem Weg zwischen Torre Tavira und Parque Genovés.'
    },
    {
      id: 'poi-5',
      title: 'Gran Teatro Falla',
      lat: 36.5342,
      lng: -6.3019,
      category: 'Hidden Gems',
      info: 'Spektakulärer roter Backsteinbau im Neo-Mudéjar-Stil (1905). Hier schlägt im Februar das Herz des weltberühmten, satirischen Karnevals von Cádiz.',
      tip: 'Liegt fast direkt auf eurem Weg zwischen La Caleta und dem Parque Genovés (Plaza Fragela).'
    },
    {
      id: 'poi-6',
      title: 'Alameda Apodaca & Riesen-Gummibäume',
      lat: 36.5368,
      lng: -6.2988,
      category: 'Hidden Gems',
      info: 'Prachtvolle Uferpromenade im Norden der Altstadt mit schwarz-weißen Kacheln und gigantischen, über 100 Jahre alten großblättrigen Feigenbäumen (Ficus macrophylla).',
      tip: 'Direkt im Anschluss an den Parque Genovés entlanglaufen – die massiven Baumwurzeln und der Blick über die Bucht von Cádiz sind genial.'
    },
    {
      id: 'poi-7',
      title: 'Oratorio de la Santa Cueva',
      lat: 36.5333,
      lng: -6.2952,
      category: 'Hidden Gems',
      info: 'Unscheinbare Kapelle aus dem 18. Jh. mit zwei Kontrasten: Unten eine nüchterne Passionskrypta, oben ein prachtvoller ovaler Saal mit 3 echten Original-Gemälden von Francisco de Goya!',
      tip: '3 echte Original-Gemälde von Francisco de Goya im oberen ovalen Saal bewundern!'
    },
    {
      id: 'poi-8',
      title: 'Plaza de España & Monumento a la Constitución de 1812',
      lat: 36.5356,
      lng: -6.2932,
      category: 'Sehenswertes',
      info: 'Kolossales weißes Denkmal für „La Pepa“ – Spaniens erste liberale Verfassung, die 1812 hier in Cádiz während der Belagerung durch Napoleons Truppen verabschiedet wurde.',
      tip: 'Spaziergang über den riesigen halbrunden Platz mit dem leeren Thron und den allegorischen Reiterstatuen.'
    },
    {
      id: 'poi-9',
      title: 'Castillo de San Sebastián',
      lat: 36.5282,
      lng: -6.3148,
      category: 'Sehenswertes',
      info: 'Liegt am südlichen Ende des La-Caleta-Strandes auf einer kleinen Felseninsel mit eisernem Leuchtturm, erreichbar über einen langen Damm mitten durch den Atlantik.',
      tip: 'Spaziergang über den steinernen Meeresdamm (Paseo Fernando Quiñones) mit bestem Blick zurück auf La Caleta.'
    },
    {
      id: 'poi-10',
      title: 'Parking Canalejas / Puerto (Start-Tipp 1)',
      lat: 36.5317,
      lng: -6.2925,
      category: 'Parken',
      info: 'Großes Parkhaus direkt am Hafen und Eingang zum Viertel El Pópulo (Startpunkt Station 1).',
      tip: 'Idealer Start-Parkplatz: In 3 Gehminuten seid ihr direkt an Station 1 (Barrio del Pópulo).'
    },
    {
      id: 'poi-11',
      title: 'Parking Campo del Sur / Catedral (Start-Tipp 2)',
      lat: 36.5280,
      lng: -6.2945,
      category: 'Parken',
      info: 'Tiefgarage direkt an der südlichen Ufermauer unterhalb von El Pópulo und der Kathedrale.',
      tip: 'Perfekt, wenn ihr direkt zwischen Station 1 (El Pópulo) und Station 2 (Kathedrale) starten wollt.'
    },
    {
      id: 'poi-12',
      title: 'Parking Santa Bárbara (Park-Tipp am Ende)',
      lat: 36.5358,
      lng: -6.3045,
      category: 'Parken',
      info: 'Tiefgarage direkt an der Promenade zwischen Parque Genovés und La Caleta.',
      tip: 'Direkt neben Ziel-Station 7 (Parque Genovés) und den Festungen an der Atlantikküste.'
    }
  ],

  bonusPresets: [
    { label: '📸 Bester Schnappschuss', points: 5, emoji: '📸' },
    { label: '🎯 Schätz-Duell exakt gelöst', points: 5, emoji: '🎯' },
    { label: '🇪🇸 Bestellung auf Spanisch', points: 5, emoji: '🇪🇸' },
    { label: '🍤 Tapas-/Getränkerunde spendiert', points: 10, emoji: '🍤' },
    { label: '🧭 Bester Navigator in den Gassen', points: 5, emoji: '🧭' },
    { label: '😫 Nörgeln / „Wie weit noch?“', points: -5, emoji: '😫' },
    { label: '📱 Handy-Zombie beim Laufen', points: -5, emoji: '📱' },
    { label: '🍺 Tapas gekleckert', points: -3, emoji: '🍺' }
  ],

  avatars: ['🦦', '🦩', '🐙', '🦈', '💃', '🕺', '☀️', '🍷', '⚓', '🍋', '🐚', '👑']
};
