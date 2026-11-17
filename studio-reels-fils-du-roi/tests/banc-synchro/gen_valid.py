# Chansons de CONTRÔLE (jamais utilisées pour régler) : mêmes outils que gen_songs.py, autres textes et réglages.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_songs as g
g.OUT = os.path.join(g.HERE, "songs_valid"); os.makedirs(g.OUT, exist_ok=True)
V = [
  dict(id="v1_ps100_chante_6dB", voice="fr4", rate=100, sung=True, reverb=False, voice_db=+6, bpm=96, intro=7.0, arp=True, dense=False, seed=11, key=4,
       gaps=[0.5, 1.4, 0.3, 2.5, 0.6, 0.9, 0.4, 1.1],
       lines=["Poussez vers l'Éternel des cris de joie", "vous tous, habitants de la terre", "Servez l'Éternel avec joie",
              "venez avec allégresse en sa présence", "Sachez que l'Éternel est Dieu", "C'est lui qui nous a faits",
              "nous lui appartenons", "Nous sommes son peuple", "et le troupeau de son pâturage"]),
  dict(id="v2_ps150_chante_dense_2dB", voice="fr1", rate=120, sung=True, reverb=True, voice_db=+2, bpm=128, intro=8.0, arp=True, dense=True, seed=12, key=1,
       gaps=[0.3, 1.0, 0.2, 0.7, 3.2, 0.4, 0.8, 0.2],
       lines=["Louez Dieu dans son sanctuaire", "Louez-le dans l'étendue où éclate sa puissance", "Louez-le pour ses hauts faits",
              "Louez-le selon l'immensité de sa grandeur", "Louez-le au son de la trompette", "Louez-le avec le luth et la harpe",
              "Louez-le avec le tambourin et avec des danses", "Que tout ce qui respire loue l'Éternel", "Louez l'Éternel"]),
  dict(id="v3_jn3_parle_8dB", voice="fr1", rate=145, sung=False, reverb=False, voice_db=+8, bpm=84, intro=5.5, arp=False, dense=False, seed=13, key=6,
       gaps=[0.4, 0.9, 0.2, 1.6, 0.5, 3.0, 0.3],
       lines=["Car Dieu a tant aimé le monde", "qu'il a donné son Fils unique", "afin que quiconque croit en lui",
              "ne périsse point", "mais qu'il ait la vie éternelle", "Dieu, en effet, n'a pas envoyé son Fils dans le monde",
              "pour qu'il juge le monde", "mais pour que le monde soit sauvé par lui"]),
  dict(id="v4_es40_chante_reverb_4dB", voice="fr4", rate=95, sung=True, reverb=True, voice_db=+4, bpm=70, intro=9.0, arp=False, dense=False, seed=14, key=8,
       gaps=[0.7, 1.8, 0.4, 0.9, 4.0, 0.6, 1.2],
       lines=["Ceux qui se confient en l'Éternel", "renouvellent leur force", "Ils prennent le vol comme les aigles",
              "Ils courent, et ne se lassent point", "Ils marchent, et ne se fatiguent point", "Il donne de la force à celui qui est fatigué",
              "et il augmente la vigueur", "de celui qui tombe en défaillance"]),
]
for c in V: g.build(c)
print("ok", [c["id"] for c in V])
