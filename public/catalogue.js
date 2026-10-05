/* Catalogue Exotic Beauty — textes, photos et regroupements repris de la maquette
   Claude Design (« Exotic Beauty v2 - Prestation »).
   ⚠️ Les PRIX, DURÉES et ACOMPTES ne sont PAS ici : ils viennent de la base de données
   (/api/services), qui reste la seule source de vérité. */
(function () {
  var I = 'images/prestations/';
  var CATALOGUE = {
    cils: {
      label: 'Extensions de cils', kicker: 'Extensions de cils / pose complète', defaut: 'volume_russe',
      items: [
        { id: 'cil_a_cil', chip: 'Cil à cil', name: 'Cil à cil', gallery: [I + 'cil-a-cil-2.jpg', I + 'cil-a-cil.jpg'], tagline: 'Effet mascara, très discret.', technique: '1 extension par cil', tenue: '3 à 4 semaines', refill: 'remplissage_cil_a_cil', kind: 'pose',
          desc: "La pose complète cil à cil consiste à poser une extension de cil sur tous les cils naturels. Effet mascara, très discret.",
          pour: ["C'est votre première pose.", 'Vous voulez un regard réveillé, sans effet maquillé.', 'Vos cils naturels sont déjà bien fournis.'] },
        { id: 'mixte', chip: 'Mixte', name: 'Pose mixte', gallery: [I + 'pose-mixte.jpg', I + 'mixte.jpg'], tagline: 'Plus de volume, tout aussi naturel.', technique: 'Cil à cil + bouquets', tenue: '3 à 4 semaines', refill: 'remplissage_mixte', kind: 'pose',
          desc: "Aussi appelé pose mixte, elle consiste à alterner entre le cil à cil et la pose volume russe. Convient à celles qui souhaitent un résultat un peu plus volumineux et sophistiqué, pour un résultat tout aussi naturel.",
          pour: ['Le cil à cil vous paraît trop léger.', 'Vous cherchez un effet naturel mais visible.'] },
        { id: 'volume_russe', chip: 'Volume russe', name: 'Volume russe', gallery: [I + 'volume-russe.jpg', I + 'hero.jpg'], tagline: 'Intense, sophistiqué, et pourtant naturel.', technique: 'Bouquets 3D à 5D', tenue: '3 à 4 semaines', refill: 'remplissage_volume_russe', kind: 'pose',
          desc: "Appelé pose volume russe, cette pose consiste à appliquer des « bouquets » de cils sur chaque cil naturel (3D, 4D, 5D). Convient à celles qui souhaitent un résultat intense, très volumineux et sophistiqué.",
          pour: ['Vous souhaitez un effet intense.', 'Votre base de cils naturels est peu fournie, mais vous souhaitez tout de même du volume.'] },
        { id: 'wispy_volume_russe', chip: 'Wispy russe', name: 'Wispy volume russe', gallery: [I + 'mixte.jpg'], tagline: 'Léger, aérien, texturé.', technique: 'Volume russe + pics', tenue: '3 à 4 semaines', refill: 'remplissage_volume_russe', kind: 'pose',
          desc: "En utilisant la méthode volume russe, la pose wispy se caractérise par un rendu léger, aérien et texturé, combinant différentes longueurs d'extensions afin de créer de subtils pics qui apportent du relief et de la dimension au regard. L'effet est volontairement irrégulier pour un résultat inspiré des cils naturels, tout en étant intensifié.",
          pour: ['Vous aimez le volume mais pas une ligne trop uniforme.', 'Vous voulez un regard qui a du relief.'] },
        { id: 'wispy_mixte', chip: 'Wispy mixte', name: 'Wispy pose mixte', gallery: [I + 'wispy-mixte-teinture.jpg'], tagline: 'Des pics subtils, un volume modéré.', technique: 'Mixte + pics', tenue: '3 à 4 semaines', refill: 'remplissage_mixte', kind: 'pose',
          desc: "En utilisant la méthode mixte, la pose wispy se caractérise par un rendu léger, aérien et texturé, combinant différentes longueurs d'extensions afin de créer de subtils pics qui apportent du relief et de la dimension au regard. L'effet est volontairement irrégulier pour un résultat inspiré des cils naturels, tout en étant intensifié.",
          pour: ['Vous voulez un effet wispy, sans trop de densité.', 'Vous aimez un regard texturé.'] },
        { id: 'wispy_cil_a_cil', chip: 'Wispy cil à cil', name: 'Wispy cil à cil', gallery: [I + 'wispy-cil.jpg'], tagline: 'Le wispy, en version légère.', technique: 'Cil à cil + pics', tenue: '3 à 4 semaines', refill: 'remplissage_cil_a_cil', kind: 'pose',
          desc: "La pose wispy en cil à cil : une extension par cil naturel, avec des longueurs alternées pour créer de subtils pics et donner du relief au regard, en restant très naturel.",
          pour: ['Vous voulez un effet wispy très discret.', "C'est votre première pose.", 'Vos cils naturels sont déjà denses.'] },
        { id: 'wet_volume_russe', chip: 'Wet', name: 'Wet volume russe', gallery: [I + 'wet.jpg'], tagline: 'Effet cils mouillés, très graphique.', technique: 'Bouquets fermés', tenue: '3 à 4 semaines', refill: 'remplissage_volume_russe', kind: 'pose',
          desc: "Appelé pose volume russe, cette pose consiste à appliquer des « bouquets » de cils sur chaque cil naturel (3D, 4D, 5D). En version wet, les bouquets sont plus fermés pour un effet cils mouillés. Convient à celles qui souhaitent un résultat intense et sophistiqué.",
          pour: ['Vous aimez les regards graphiques.', 'Vous voulez un effet visible de loin.'] },
        { id: 'lash_lift', chip: 'Lash lift', name: 'Lash lift avec teinture', gallery: [I + 'lash-lift-1.jpg', I + 'lash-lift-2.jpg'], tagline: 'Vos cils, recourbés et intensifiés.', technique: 'Rehaussement + teinture', tenue: '6 à 8 semaines', refill: null, kind: 'lift',
          desc: "Le Lash Lift est un soin qui modifie temporairement (jusqu'à 8 semaines) la texture des cils afin de leur donner un effet plus courbé et lifté. Cette technique permet de recourber les cils naturels vers le haut, depuis leur base, pour leur donner un effet allongé et lifté. Ce soin est idéal pour des cils fins à épais, frisés, très longs ou indisciplinés. La teinture est comprise dans la prestation pour donner plus d'intensité au regard.",
          pour: ['Vous souhaitez un effet mascara naturel, avec vos propres cils.', 'Vous ne supportez pas les extensions de cils.', 'Vos cils sont droits ou très recourbés.'] }
      ]
    },
    remplissage: {
      label: 'Remplissage', kicker: 'Extensions de cils / remplissage', defaut: 'remplissage_cil_a_cil',
      items: [
        { id: 'remplissage_cil_a_cil', chip: 'Cil à cil', name: 'Remplissage cil à cil', gallery: [I + 'cil-a-cil-2.jpg'], tagline: 'Une ligne pleine, sans repartir de zéro.', technique: 'Cil à cil', tenue: '3 à 4 semaines', refill: null, kind: 'rem',
          desc: "Le remplissage doit être effectué dans la limite de 3 à 4 semaines suivant la pose. Les extensions qui ont suivi la pousse sont retirées, puis la ligne est complétée.",
          pour: ['Votre pose date de moins de 4 semaines.', 'Votre pose a été réalisée chez Exotic Beauty.', 'Vous voulez garder le même effet.'] },
        { id: 'remplissage_mixte', chip: 'Mixte', name: 'Remplissage mixte', gallery: [I + 'pose-mixte.jpg'], tagline: 'Une ligne pleine, sans repartir de zéro.', technique: 'Mixte', tenue: '3 à 4 semaines', refill: null, kind: 'rem',
          desc: "Le remplissage doit être effectué dans la limite de 3 à 4 semaines suivant la pose. Les extensions qui ont suivi la pousse sont retirées, puis la ligne est complétée.",
          pour: ['Votre pose date de moins de 4 semaines.', 'Votre pose a été réalisée chez Exotic Beauty.', 'Vous voulez garder le même effet.'] },
        { id: 'remplissage_volume_russe', chip: 'Volume russe', name: 'Remplissage volume russe', gallery: [I + 'volume-russe.jpg'], tagline: 'Une ligne pleine, sans repartir de zéro.', technique: 'Volume russe', tenue: '3 à 4 semaines', refill: null, kind: 'rem',
          desc: "Le remplissage doit être effectué dans la limite de 3 à 4 semaines suivant la pose. Les extensions qui ont suivi la pousse sont retirées, puis la ligne est complétée.",
          pour: ['Votre pose date de moins de 4 semaines.', 'Votre pose a été réalisée chez Exotic Beauty.', 'Vous voulez garder le même effet.'] },
        { id: 'depose', chip: 'Dépose', name: 'Dépose', gallery: [I + 'studio-soin.jpg'], tagline: 'Un retrait doux, sans casser le cil.', technique: 'Dissolvant doux', tenue: '—', refill: null, kind: 'rem',
          desc: "Retrait complet des extensions avec un dissolvant doux, sans tirer sur le cil naturel. Uniquement pour les poses réalisées chez Exotic Beauty.",
          pour: ['Vous voulez faire une pause.', 'Votre pose a été réalisée chez Exotic Beauty.', 'Vous voulez changer de technique.'] }
      ]
    },
    sourcils: {
      label: 'Sourcils', kicker: 'Sourcils', defaut: 'brow_lift',
      items: [
        { id: 'brow_lift', chip: 'Brow lift', name: 'Brow lift', gallery: [I + 'brow-lift-3.jpg', I + 'brow-lift-2.jpg', I + 'brow-lift.jpg'], tagline: 'Des sourcils disciplinés, plus épais.', technique: 'Rehaussement du poil', tenue: "Jusqu'à 8 semaines", refill: null, kind: 'brow',
          desc: "Le Brow Lift est un soin qui modifie temporairement (jusqu'à 8 semaines) la texture des poils afin de leur donner un effet plus épais. Il permet de rendre les poils plus souples et disciplinés. Ce soin est idéal pour les sourcils frisés, très longs ou indisciplinés. L'épilation au fil est comprise dans la prestation.",
          pour: ['Vos sourcils sont indisciplinés.', 'Vous voulez un effet plus fourni sans maquillage.', 'Vous voulez une ligne nette chaque matin.'] },
        { id: 'brow_lift_teinture', chip: 'Brow lift + teinture', name: 'Brow lift avec teinture', gallery: [I + 'brow-lift-teinture.jpg'], tagline: 'Forme, densité et couleur.', technique: 'Rehaussement + teinture hybride', tenue: 'Peau 2 sem. · poils 7 sem.', refill: null, kind: 'brow',
          desc: "Le Brow Lift est cumulé à la teinture hybride, une technique qui colore temporairement la peau et les poils du sourcil. Durée : jusqu'à 2 semaines sur la peau et jusqu'à 7 semaines sur les poils. L'épilation est comprise dans cette prestation.",
          pour: ['Vos sourcils sont indisciplinés et vous souhaitez restructurer votre regard.', 'Vos sourcils sont un peu clairs.', 'Vous souhaitez vous projeter avant un maquillage permanent.'] },
        { id: 'teinture_hybride', chip: 'Teinture hybride', name: 'Teinture hybride', gallery: [I + 'wispy-mixte-teinture.jpg', I + 'sourcil-avant.jpg', I + 'sourcil-apres.jpg'], tagline: 'La couleur qui comble les trous.', technique: 'Teinture peau + poils', tenue: 'Peau 10 j · poils 7 sem.', refill: null, kind: 'brow',
          desc: "La teinture hybride est une technique qui va venir colorer la peau et les poils du sourcil temporairement. Durée : jusqu'à 10 jours sur la peau et jusqu'à 7 semaines sur les poils. L'épilation au fil est comprise dans cette prestation.",
          pour: ['Vos sourcils sont clairs ou clairsemés.', 'Vous voulez tester avant une micro-pigmentation.', 'Vous voulez moins de maquillage le matin.'] },
        { id: 'epilation_restructuration', chip: 'Fil · restructuration', name: 'Épilation au fil', gallery: [I + 'epilation-fil.jpg'], tagline: 'Une ligne redessinée, précise.', technique: 'Fil de coton', tenue: '3 à 4 semaines', refill: null, kind: 'brow',
          desc: "L'épilation au fil est une méthode traditionnelle et naturelle pour éliminer les poils. Originaire d'Asie et du Moyen-Orient, elle permet une épilation beaucoup plus précise, et plus douce pour la peau car sans produit chimique ni chaleur.",
          pour: ['Vous voulez redessiner votre ligne.', 'Vous avez la peau sensible à la cire.', "C'est votre premier rendez-vous sourcils."] },
        { id: 'epilation_entretien', chip: 'Fil · entretien', name: 'Épilation au fil (entretien)', gallery: [I + 'epilation-fil.jpg'], tagline: 'Garder la ligne entre deux rendez-vous.', technique: 'Fil de coton', tenue: '3 à 4 semaines', refill: null, kind: 'brow',
          desc: "Cette prestation est réservable pour les clientes qui souhaitent juste entretenir leur ligne. Épilation au fil, précise et douce pour la peau.",
          pour: ['Votre ligne a déjà été dessinée.', 'Vous voulez un entretien rapide.', 'Vous avez la peau sensible à la cire.'] },
        { id: 'epilation_levres', chip: 'Lèvre supérieure', name: 'Épilation lèvre supérieure', gallery: [I + 'sourcil-apres.jpg'], tagline: 'Rapide et précise.', technique: 'Fil de coton', tenue: '3 à 4 semaines', refill: null, kind: 'brow',
          desc: "Épilation au fil de la zone moustache. Méthode précise et plus douce pour la peau, sans produit chimique ni chaleur.",
          pour: ['Vous avez la peau sensible à la cire.', 'Vous voulez un résultat net.', "Vous l'ajoutez à un autre soin."] },
        { id: 'ombre_powder_brow', chip: 'Ombré powder', name: 'Ombré powder brow', gallery: [I + 'powder-1.jpg', I + 'powder-2.jpg', I + 'powder-3.jpg'], tagline: 'Maquillage permanent, effet poudré.', technique: 'Micro-pigmentation', tenue: '12 à 18 mois', refill: null, kind: 'brow',
          desc: "Technique de maquillage permanent permettant de restructurer les sourcils clairsemés, fins, ou dont la queue ou la tête est inexistante. Avant de réserver, prenez connaissance des conditions ou réservez une consultation. Contre-indications : allergies, maladies de peau évolutives, grossesse ou allaitement, diabète non contrôlé, maladie auto-immune, hémophilie, cicatrisation difficile, entre autres. Pas de soleil pendant 30 jours, pas d'eau pendant 48 h, pas de sport pendant 10 jours.",
          pour: ['Votre ligne de sourcils est mal définie.', 'Vos sourcils sont clairsemés ou présentent des trous.', 'Vous souhaitez un résultat qui dure, environ 12 à 18 mois.'] }
      ]
    },
    offre: {
      label: 'Offre regard', kicker: 'Offre regard / cils + sourcils', defaut: 'offre_cil_a_cil',
      items: [
        { id: 'offre_cil_a_cil', chip: 'Cil à cil + brow lift', name: 'Cil à cil + brow lift', gallery: [I + 'brow-lift-3.jpg', I + 'cil-a-cil-2.jpg'], tagline: 'Le regard complet, en version discrète.', technique: 'Cil à cil + rehaussement sourcils', tenue: 'Cils 3–4 sem. · sourcils 8 sem.', refill: 'remplissage_cil_a_cil', kind: 'offre',
          desc: "Une pose de cils cil à cil, accompagnée d'un brow lift. Sans teinture. Cils et sourcils sont traités dans le même rendez-vous, à un tarif combiné.",
          pour: ['Vous voulez un regard complet en un seul rendez-vous.', 'Vous aimez les effets naturels.', 'Vous voulez un regard plus discipliné, grâce au brow lift.'] },
        { id: 'offre_mixte', chip: 'Mixte + brow lift', name: 'Pose mixte + brow lift', gallery: [I + 'pose-mixte.jpg', I + 'brow-lift-teinture.jpg'], tagline: 'Plus de volume, des sourcils disciplinés.', technique: 'Mixte + rehaussement sourcils', tenue: 'Cils 3–4 sem. · sourcils 8 sem.', refill: 'remplissage_mixte', kind: 'offre',
          desc: "Une pose de cils mixte, accompagnée d'un brow lift. Sans teinture. Cils et sourcils sont traités dans le même rendez-vous, à un tarif combiné.",
          pour: ['Vous voulez un regard complet en un seul rendez-vous.', 'Le cil à cil vous paraît trop léger.', 'Vous voulez un regard plus discipliné, grâce au brow lift.'] },
        { id: 'offre_volume_russe', chip: 'Volume russe + brow lift', name: 'Volume russe + brow lift', gallery: [I + 'brow-lift-teinture.jpg', I + 'volume-russe.jpg'], tagline: 'Le regard intense, de bout en bout.', technique: 'Volume russe + rehaussement sourcils', tenue: 'Cils 3–4 sem. · sourcils 8 sem.', refill: 'remplissage_volume_russe', kind: 'offre',
          desc: "Une pose de cils volume russe, accompagnée d'un brow lift. Sans teinture. Cils et sourcils sont traités dans le même rendez-vous, à un tarif combiné.",
          pour: ['Vous voulez un effet intense, sans mascara.', 'Vous voulez un regard complet en un seul rendez-vous.', 'Vous voulez des sourcils structurés et disciplinés, grâce au brow lift.'] }
      ]
    }
  };

  // Compléments proposés à l'étape « Votre rendez-vous » (maquette « Reservation »).
  var COMPLEMENTS = {
    depose: 'Dépose des anciennes extensions',
    epilation_entretien: 'Épilation sourcils au fil',
    epilation_levres: 'Épilation lèvre supérieure',
    brow_lift: 'Brow lift',
    teinture_hybride: 'Teinture hybride sourcils',
    brow_lift_teinture: 'Brow lift avec teinture',
    lash_lift: 'Lash lift avec teinture'
  };
  function complementsPour(item) {
    var k = item.kind, id = item.id;
    var liste = k === 'pose' ? ['depose', 'brow_lift', 'brow_lift_teinture', 'teinture_hybride', 'epilation_entretien', 'epilation_levres']
      : k === 'offre' ? ['depose', 'epilation_levres']
      : (k === 'rem' || k === 'lift') ? ['brow_lift', 'brow_lift_teinture', 'teinture_hybride', 'epilation_entretien', 'epilation_levres']
      : ['lash_lift', 'brow_lift', 'teinture_hybride', 'epilation_entretien', 'epilation_levres'];
    return liste.filter(function (c) {
      if (c === id) return false;
      if (id === 'brow_lift_teinture' && (c === 'brow_lift' || c === 'teinture_hybride')) return false;
      if (c === 'epilation_entretien' && /^brow_lift|^teinture/.test(id)) return false;
      return true;
    });
  }

  function trouver(id) {
    for (var c in CATALOGUE) {
      for (var i = 0; i < CATALOGUE[c].items.length; i++) {
        if (CATALOGUE[c].items[i].id === id) return { cat: c, item: CATALOGUE[c].items[i] };
      }
    }
    return null;
  }

  // Petits utilitaires partagés
  var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var JOURS_L = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var U = {
    euros: function (c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; },
    duree: function (m) { var h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + String(r).padStart(2, '0') : '') : r + ' min'; },
    min: function (hhmm) { return +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5); },
    hm: function (m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); },
    jour: function (iso) { return new Date(iso + 'T12:00:00Z'); },
    court: function (iso) { var d = U.jour(iso); return JOURS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MOIS[d.getUTCMonth()]; },
    long: function (iso) { var d = U.jour(iso); return JOURS_L[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MOIS_L[d.getUTCMonth()]; },
    ajouter: function (iso, n) { var d = U.jour(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); },
    // Même règle que le serveur (notifications.js) : numéro → format international.
    e164: function (raw) {
      var s = String(raw || '').trim().replace(/[\s.\-()]/g, '');
      if (s.indexOf('00') === 0) s = '+' + s.slice(2);
      if (s[0] === '+') { var x = s.slice(1).replace(/\D/g, ''); if (x.indexOf('330') === 0) return U.e164('0' + x.slice(3)); return x.length >= 8 && x.length <= 15 ? '+' + x : null; }
      var d = s.replace(/\D/g, '');
      if (d.length === 9 && /^69[67]/.test(d)) return '+596' + d;
      if (d.length !== 10 || d[0] !== '0') return null;
      var n = d.slice(1);
      if (/^(69[67]|596)/.test(n)) return '+596' + n;
      if (/^(69[01]|590)/.test(n)) return '+590' + n;
      if (/^(694|594)/.test(n)) return '+594' + n;
      if (/^(69[23]|262)/.test(n)) return '+262' + n;
      if (/^[1-79]/.test(n)) return '+33' + n;
      return null;
    },
    esc: function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); },
    JOURS: JOURS, MOIS: MOIS, MOIS_L: MOIS_L
  };

  window.EB = { CATALOGUE: CATALOGUE, COMPLEMENTS: COMPLEMENTS, complementsPour: complementsPour, trouver: trouver, U: U, WHATSAPP: 'https://wa.me/33770211399' };
})();
